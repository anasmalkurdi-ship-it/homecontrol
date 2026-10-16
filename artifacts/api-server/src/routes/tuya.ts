import {
  SendTuyaDeviceCommandsBody,
  SendTuyaDeviceCommandsResponse,
  GetTuyaConnectionResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Response } from "express";
import {
  checkTuyaConnection,
  getTuyaDeviceControls,
  listTuyaDevices,
  sendTuyaCommands,
  TuyaCloudError,
} from "../lib/tuyaCloud";

const router: IRouter = Router();

function handleTuyaError(res: Response, error: unknown) {
  if (error instanceof TuyaCloudError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  return res.status(502).json({ error: "Tuya Cloud request failed." });
}

router.get("/connection", async (_req, res) => {
  const result = await checkTuyaConnection();
  res.json(GetTuyaConnectionResponse.parse(result));
});

router.get("/devices", async (_req, res) => {
  try {
    res.json(await listTuyaDevices());
  } catch (error) {
    handleTuyaError(res, error);
  }
});

router.get("/devices/:deviceId/controls", async (req, res) => {
  try {
    res.json(await getTuyaDeviceControls(req.params.deviceId));
  } catch (error) {
    handleTuyaError(res, error);
  }
});

router.post("/devices/:deviceId/commands", async (req, res) => {
  try {
    const body = SendTuyaDeviceCommandsBody.parse(req.body);
    const commands = body.commands.map((command) => ({
      code: command.code,
      value: command.value,
    }));
    const result = await sendTuyaCommands(req.params.deviceId, commands);
    res.json(SendTuyaDeviceCommandsResponse.parse(result));
  } catch (error) {
    if (error instanceof TuyaCloudError) {
      handleTuyaError(res, error);
      return;
    }
    res.status(400).json({ error: "Invalid Tuya command request." });
  }
});

export default router;
