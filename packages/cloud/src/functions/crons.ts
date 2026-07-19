import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup relay messages",
  { minutes: 1 },
  internal.relay.cleanup,
  {},
);

export default crons;
