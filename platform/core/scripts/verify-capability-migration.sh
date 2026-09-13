#!/usr/bin/env bash
set -euo pipefail

for command in initdb pg_ctl createdb diesel cargo; do
    if ! command -v "${command}" >/dev/null 2>&1; then
        echo "missing required command: ${command}" >&2
        exit 1
    fi
done

test_root="$(mktemp -d /tmp/nemu-capability.XXXXXX)"
data_dir="${test_root}/data"
socket_dir="${test_root}/socket"
database_name="nemu_capability_test"

cleanup() {
    if [[ -d "${data_dir}" ]]; then
        pg_ctl -D "${data_dir}" -m fast -w stop >/dev/null 2>&1 || true
    fi
    rm -rf "${test_root}"
}
trap cleanup EXIT

mkdir "${socket_dir}"
initdb -D "${data_dir}" --auth=trust --encoding=UTF8 --no-locale >/dev/null
pg_ctl -D "${data_dir}" -o "-F -h '' -k ${socket_dir}" -w start >/dev/null
createdb -h "${socket_dir}" "${database_name}"

database_url="postgresql://$(id -un)@/${database_name}?host=${socket_dir}"
export DATABASE_URL="${database_url}"
export CAPABILITY_TEST_DATABASE_URL="${database_url}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
core_dir="$(cd "${script_dir}/.." && pwd)"
cd "${core_dir}"

diesel migration run
diesel migration revert
diesel migration run
cargo test --locked \
    capabilities::persistence::tests::tombstones_resurrect_only_an_exact_identity_match \
    -- --ignored --exact
