use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::sql_types::Text;
use thiserror::Error;
use uuid::Uuid;

use crate::db::schema::capability_identities;
use crate::state::DbPool;

use super::{
    CapabilityId, CapabilityValidationError, CompleteCapabilityManifest, DeviceIdentity,
    RegisteredCapability,
};

#[derive(Debug, Insertable)]
#[diesel(table_name = capability_identities)]
struct NewCapabilityIdentity<'a> {
    protocol: &'a str,
    device_external_id: &'a str,
    component_path: &'a [String],
    kind: &'a str,
    physical_scope_kind: &'a str,
    physical_scope_component_id: &'a str,
}

#[derive(Clone)]
pub struct CapabilityRepository {
    pool: DbPool,
}

impl CapabilityRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Reconciles one complete Device manifest atomically. Only an exact match
    /// across every trustworthy identity field can resurrect a tombstoned ID.
    pub async fn reconcile_complete_manifest(
        &self,
        manifest: CompleteCapabilityManifest,
        received_at: DateTime<Utc>,
    ) -> Result<Vec<RegisteredCapability>, CapabilityStoreError> {
        manifest.validate()?;
        let conn = self.pool.get().await?;
        conn.interact(move |conn| reconcile_sync(conn, manifest, received_at))
            .await?
    }

    pub async fn tombstone_device(
        &self,
        device: DeviceIdentity,
        removed_at: DateTime<Utc>,
    ) -> Result<usize, CapabilityStoreError> {
        let conn = self.pool.get().await?;
        conn.interact(move |conn| {
            conn.transaction(|conn| {
                lock_device_identity(conn, &device)?;
                diesel::update(
                    capability_identities::table
                        .filter(capability_identities::protocol.eq(device.protocol))
                        .filter(capability_identities::device_external_id.eq(device.external_id))
                        .filter(capability_identities::tombstoned_at.is_null()),
                )
                .set(capability_identities::tombstoned_at.eq(Some(removed_at)))
                .execute(conn)
                .map_err(CapabilityStoreError::from)
            })
        })
        .await?
    }
}

fn reconcile_sync(
    conn: &mut PgConnection,
    manifest: CompleteCapabilityManifest,
    received_at: DateTime<Utc>,
) -> Result<Vec<RegisteredCapability>, CapabilityStoreError> {
    conn.transaction(|conn| {
        let protocol = manifest.device.protocol.clone();
        let external_id = manifest.device.external_id.clone();
        lock_device_identity(conn, &manifest.device)?;
        let mut registered = Vec::with_capacity(manifest.capabilities.len());

        for declaration in manifest.capabilities {
            let identity = &declaration.identity;
            let (scope_kind, scope_component_id) = identity.physical_scope.storage_parts();
            let id = diesel::insert_into(capability_identities::table)
                .values(NewCapabilityIdentity {
                    protocol: &identity.device.protocol,
                    device_external_id: &identity.device.external_id,
                    component_path: &identity.component_path,
                    kind: identity.kind.as_str(),
                    physical_scope_kind: scope_kind,
                    physical_scope_component_id: scope_component_id,
                })
                .on_conflict((
                    capability_identities::protocol,
                    capability_identities::device_external_id,
                    capability_identities::component_path,
                    capability_identities::kind,
                    capability_identities::physical_scope_kind,
                    capability_identities::physical_scope_component_id,
                ))
                .do_update()
                .set(capability_identities::tombstoned_at.eq::<Option<DateTime<Utc>>>(None))
                .returning(capability_identities::id)
                .get_result::<Uuid>(conn)?;

            registered.push(RegisteredCapability {
                id: CapabilityId::from(id),
                declaration,
            });
        }

        let retained_ids = registered
            .iter()
            .map(|capability| capability.id.into_uuid())
            .collect::<Vec<_>>();
        let active_for_device = capability_identities::table
            .filter(capability_identities::protocol.eq(protocol))
            .filter(capability_identities::device_external_id.eq(external_id))
            .filter(capability_identities::tombstoned_at.is_null());
        if retained_ids.is_empty() {
            diesel::update(active_for_device)
                .set(capability_identities::tombstoned_at.eq(Some(received_at)))
                .execute(conn)?;
        } else {
            diesel::update(
                active_for_device.filter(capability_identities::id.ne_all(retained_ids)),
            )
            .set(capability_identities::tombstoned_at.eq(Some(received_at)))
            .execute(conn)?;
        }

        Ok(registered)
    })
}

fn lock_device_identity(
    conn: &mut PgConnection,
    device: &DeviceIdentity,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, hashtextextended($2, 0)))",
    )
    .bind::<Text, _>(&device.protocol)
    .bind::<Text, _>(&device.external_id)
    .execute(conn)?;
    Ok(())
}

#[derive(Debug, Error)]
pub enum CapabilityStoreError {
    #[error(transparent)]
    InvalidManifest(#[from] CapabilityValidationError),
    #[error("database pool error: {0}")]
    Pool(#[from] deadpool_diesel::PoolError),
    #[error("database interaction failed: {0}")]
    Interaction(#[from] deadpool_diesel::InteractError),
    #[error(transparent)]
    Database(#[from] diesel::result::Error),
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};

    use super::*;
    use crate::capabilities::{CanonicalUnit, CapabilityKind, DeviceIdentity, PhysicalScope};

    fn at(second: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(second, 0).single().unwrap()
    }

    fn pool() -> DbPool {
        crate::db::test_pool()
    }

    fn manifest(
        declaration: crate::capabilities::CapabilityDeclaration,
    ) -> CompleteCapabilityManifest {
        CompleteCapabilityManifest {
            device: declaration.identity.device.clone(),
            capabilities: vec![declaration],
        }
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn tombstones_resurrect_only_an_exact_identity_match() {
        let repository = CapabilityRepository::new(pool());
        let device = DeviceIdentity::new("zigbee", format!("plug-{}", Uuid::new_v4())).unwrap();
        let declaration = RegisteredCapability::for_test(
            CapabilityId::from_uuid(Uuid::new_v4()),
            &device.protocol,
            &device.external_id,
            CapabilityKind::Power,
            PhysicalScope::Device,
            60_000,
        )
        .declaration;
        let first = repository
            .reconcile_complete_manifest(manifest(declaration.clone()), at(1))
            .await
            .unwrap();
        let original_id = first[0].id;

        repository
            .tombstone_device(device.clone(), at(2))
            .await
            .unwrap();
        let exact = repository
            .reconcile_complete_manifest(manifest(declaration.clone()), at(3))
            .await
            .unwrap();
        assert_eq!(exact[0].id, original_id);

        repository
            .reconcile_complete_manifest(
                CompleteCapabilityManifest {
                    device: device.clone(),
                    capabilities: Vec::new(),
                },
                at(4),
            )
            .await
            .unwrap();
        let exact_after_empty_manifest = repository
            .reconcile_complete_manifest(manifest(declaration.clone()), at(5))
            .await
            .unwrap();
        assert_eq!(exact_after_empty_manifest[0].id, original_id);

        let mut changed_path = declaration.clone();
        changed_path.identity.component_path = vec!["endpoint-1".into()];
        let mut changed_kind = declaration.clone();
        changed_kind.identity.kind = CapabilityKind::Voltage;
        changed_kind.unit = CanonicalUnit::Volts;
        let mut changed_scope = declaration.clone();
        changed_scope.identity.physical_scope = PhysicalScope::Home;
        let mut changed_device = declaration.clone();
        changed_device.identity.device =
            DeviceIdentity::new("matter", &device.external_id).unwrap();

        for (index, changed_identity) in [changed_path, changed_kind, changed_scope, changed_device]
            .into_iter()
            .enumerate()
        {
            let changed = repository
                .reconcile_complete_manifest(manifest(changed_identity), at(6 + index as i64))
                .await
                .unwrap();
            assert_ne!(changed[0].id, original_id);
        }

        let original_again = repository
            .reconcile_complete_manifest(manifest(declaration), at(10))
            .await
            .unwrap();
        assert_eq!(original_again[0].id, original_id);
    }
}
