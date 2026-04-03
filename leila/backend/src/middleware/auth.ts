import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin, createUserSupabase } from '../config/supabase'

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  req.user = user
  req.supabase = createUserSupabase(token)
  next()
}

// Extend Express types
declare global {
  namespace Express {
    interface Request {
      user?: import('@supabase/supabase-js').User
      supabase?: import('@supabase/supabase-js').SupabaseClient
    }
  }
}
