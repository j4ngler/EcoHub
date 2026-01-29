import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { badRequest } from './error.middleware';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        res.status(400).json({
          success: false,
          message: 'Dữ liệu không hợp lệ',
          errors: errorMessages,
        });
      } else {
        next(error);
      }
    }
  };
};
