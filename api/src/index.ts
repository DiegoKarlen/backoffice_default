import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { rolesRouter } from "./routes/roles.js";
import { functionalitiesRouter } from "./routes/functionalities.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/roles", rolesRouter);
app.use("/functionalities", functionalitiesRouter);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`api listening on http://localhost:${port}`);
});
