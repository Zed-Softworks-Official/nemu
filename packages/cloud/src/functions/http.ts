import { httpRouter } from "convex/server";
import { registerHttp } from "./controllers";

const http = httpRouter();

http.route({
  path: "/controllers/register",
  method: "POST",
  handler: registerHttp,
});

export default http;
