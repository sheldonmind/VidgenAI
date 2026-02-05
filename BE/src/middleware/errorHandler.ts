import { NextFunction, Request, Response } from "express";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Error handler:", error);
  
  // Check if it's a Prisma error
  if (error.name === "PrismaClientKnownRequestError" || error.name === "PrismaClientInitializationError") {
    console.error("Database error:", error);
    return res.status(500).json({ 
      error: "Database connection error", 
      message: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
    });
  }
  
  const message = error.message || "Unexpected error";
  const statusCode = (error as any).statusCode || 400;
  res.status(statusCode).json({ error: message });
};
