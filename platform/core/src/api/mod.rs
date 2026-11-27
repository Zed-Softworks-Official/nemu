pub mod access;
pub mod audit;
pub mod auth;
pub mod devices;
pub mod error;
pub mod health;
pub mod history_budget;
pub mod history_health;
pub mod identify;
pub mod landing;
pub mod local_access;
pub mod matter;
pub mod members;
pub mod middleware;
pub mod pairing;
pub mod rooms;
pub mod router;
pub mod session;
pub mod updates;
pub mod ws;
pub mod zigbee;

#[cfg(test)]
mod local_access_tests;
