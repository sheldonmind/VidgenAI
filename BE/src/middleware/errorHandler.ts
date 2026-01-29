import { NextFunction, Request, Response } from "express";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const message = error.message || "Unexpected error";
  res.status(400).json({ error: message });
};
