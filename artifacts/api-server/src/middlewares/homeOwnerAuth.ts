import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireSignedInOwner: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to control home devices." });
    return;
  }

  const ownerEmail = process.env.HOME_CONTROL_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    res.status(503).json({ error: "The home-control owner account is not configured." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isVerifiedOwner = user.emailAddresses.some(
      (address) =>
        address.id === user.primaryEmailAddressId &&
        address.emailAddress.trim().toLowerCase() === ownerEmail &&
        address.verification?.status === "verified",
    );

    if (!isVerifiedOwner) {
      res.status(403).json({ error: "This account is not authorized for this home." });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "Could not verify the signed-in account." });
  }
};
