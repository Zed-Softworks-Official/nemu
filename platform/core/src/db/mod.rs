pub mod models;
pub mod schema;

#[cfg(test)]
pub fn test_pool() -> crate::state::DbPool {
    use deadpool_diesel::postgres::{Manager, Pool, Runtime};

    let database_url = std::env::var("CAPABILITY_TEST_DATABASE_URL")
        .expect("CAPABILITY_TEST_DATABASE_URL must name the isolated test database");
    let manager = Manager::new(database_url, Runtime::Tokio1);
    Pool::builder(manager).max_size(2).build().unwrap()
}
