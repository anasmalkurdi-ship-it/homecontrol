import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tuyaRouter from "./tuya";
import { requireSignedInOwner } from "../middlewares/homeOwnerAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tuya", requireSignedInOwner, tuyaRouter);

export default router;
