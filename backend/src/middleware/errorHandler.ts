import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message ?? "Internal server error";

  if (statusCode >= 500) {
    console.error("[error]", err);
  }

  res.status(statusCode).json({
    error: err.code ?? "internal_error",
    message,
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: "not_found",
    message: "The requested endpoint does not exist.",
  });
}
