import { z } from "zod";

// Registration schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export { loginSchema, registerSchema };
