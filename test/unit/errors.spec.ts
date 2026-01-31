// Unit tests for src/utils/errors.ts

import { describe, it, expect } from 'vitest';
import {
  AppError,
  AuthError,
  ApiError,
  DatabaseError,
  ValidationError,
  NotFoundError,
  isAppError,
  getErrorMessage,
} from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default status 500', () => {
      const error = new AppError('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AppError');
    });

    it('should accept custom status code', () => {
      const error = new AppError('Not found', 404, 'CUSTOM_CODE');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('CUSTOM_CODE');
    });

    it('should be an instance of Error', () => {
      const error = new AppError('Test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have undefined code when not provided', () => {
      const error = new AppError('Test', 400);
      expect(error.code).toBeUndefined();
    });
  });

  describe('AuthError', () => {
    it('should default to 401 status and AUTH_ERROR code', () => {
      const error = new AuthError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.message).toBe('Authentication failed');
      expect(error.name).toBe('AuthError');
    });

    it('should accept custom message', () => {
      const error = new AuthError('Token expired');
      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });

    it('should be an instance of AppError', () => {
      const error = new AuthError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('ApiError', () => {
    it('should default to 502 status and API_ERROR code', () => {
      const error = new ApiError('API timeout');
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('API_ERROR');
      expect(error.name).toBe('ApiError');
    });

    it('should store original API status', () => {
      const error = new ApiError('Bad request', 400);
      expect(error.apiStatus).toBe(400);
    });

    it('should have undefined apiStatus when not provided', () => {
      const error = new ApiError('Error');
      expect(error.apiStatus).toBeUndefined();
    });

    it('should be an instance of AppError', () => {
      const error = new ApiError('Test');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('DatabaseError', () => {
    it('should default to 500 status and DB_ERROR code', () => {
      const error = new DatabaseError();
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DB_ERROR');
      expect(error.message).toBe('Database operation failed');
      expect(error.name).toBe('DatabaseError');
    });

    it('should accept custom message', () => {
      const error = new DatabaseError('Query failed');
      expect(error.message).toBe('Query failed');
    });

    it('should be an instance of AppError', () => {
      const error = new DatabaseError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('ValidationError', () => {
    it('should have 400 status and VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should be an instance of AppError', () => {
      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('should have 404 status and NOT_FOUND code', () => {
      const error = new NotFoundError();
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should accept custom message', () => {
      const error = new NotFoundError('User not found');
      expect(error.message).toBe('User not found');
    });

    it('should be an instance of AppError', () => {
      const error = new NotFoundError();
      expect(error).toBeInstanceOf(AppError);
    });
  });
});

describe('isAppError', () => {
  it('should return true for AppError instances', () => {
    expect(isAppError(new AppError('test'))).toBe(true);
  });

  it('should return true for AuthError instances', () => {
    expect(isAppError(new AuthError())).toBe(true);
  });

  it('should return true for ApiError instances', () => {
    expect(isAppError(new ApiError('test'))).toBe(true);
  });

  it('should return true for DatabaseError instances', () => {
    expect(isAppError(new DatabaseError())).toBe(true);
  });

  it('should return true for ValidationError instances', () => {
    expect(isAppError(new ValidationError('test'))).toBe(true);
  });

  it('should return true for NotFoundError instances', () => {
    expect(isAppError(new NotFoundError())).toBe(true);
  });

  it('should return false for regular Error', () => {
    expect(isAppError(new Error('test'))).toBe(false);
  });

  it('should return false for TypeError', () => {
    expect(isAppError(new TypeError('test'))).toBe(false);
  });

  it('should return false for null', () => {
    expect(isAppError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isAppError(undefined)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isAppError('error')).toBe(false);
  });

  it('should return false for number', () => {
    expect(isAppError(42)).toBe(false);
  });

  it('should return false for plain object', () => {
    expect(isAppError({ message: 'error', statusCode: 500 })).toBe(false);
  });

  it('should return false for array', () => {
    expect(isAppError(['error'])).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('should extract message from Error instance', () => {
    expect(getErrorMessage(new Error('Test message'))).toBe('Test message');
  });

  it('should extract message from AppError instance', () => {
    expect(getErrorMessage(new AppError('App error'))).toBe('App error');
  });

  it('should extract message from AuthError instance', () => {
    expect(getErrorMessage(new AuthError('Auth failed'))).toBe('Auth failed');
  });

  it('should extract message from ApiError instance', () => {
    expect(getErrorMessage(new ApiError('API error'))).toBe('API error');
  });

  it('should return string errors directly', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('should return empty string for empty string input', () => {
    expect(getErrorMessage('')).toBe('');
  });

  it('should return default message for null', () => {
    expect(getErrorMessage(null)).toBe('An unknown error occurred');
  });

  it('should return default message for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
  });

  it('should return default message for number', () => {
    expect(getErrorMessage(42)).toBe('An unknown error occurred');
  });

  it('should return default message for plain object', () => {
    expect(getErrorMessage({ error: true })).toBe('An unknown error occurred');
  });

  it('should return default message for array', () => {
    expect(getErrorMessage(['error'])).toBe('An unknown error occurred');
  });

  it('should return default message for boolean', () => {
    expect(getErrorMessage(false)).toBe('An unknown error occurred');
  });
});
