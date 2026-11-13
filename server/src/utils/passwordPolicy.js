import { z } from 'zod';

// Passwords that attackers try first, including this project's published demo passwords.
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789', '1234567890', '11111111', '00000000',
  'qwertyui', 'qwerty123', 'abcd1234', 'abc12345', 'iloveyou', 'letmein123', 'welcome123', 'bangladesh',
  'admin123', 'admin1234', 'admin12345', 'administrator', 'teacher1234', 'student1234', 'parent1234', 'account1234',
  'school123', 'school1234', 'madrasa123', 'madrasa1234',
]);

export const PASSWORD_MIN_LENGTH = 8;

/** Rule for every newly chosen password (existing passwords keep working until they are changed). */
export const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => !COMMON.has(value.toLowerCase()), 'This password is too common. Choose a harder one.')
  .refine((value) => new Set(value).size >= 4, 'Password is too simple. Use a mix of different characters.');
