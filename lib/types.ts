export type UserRole = 'user' | 'admin'

export type Profile = {
  id: string
  username: string | null
  full_name?: string | null
  avatar_url: string | null
  push_token: string | null
  role?: UserRole
  message_privacy?: 'everyone' | 'friends'
  is_private?: boolean
  updated_at?: string
  created_at: string
}

export type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  image_url?: string | null
  is_read?: boolean
  created_at: string
  sender?: Profile
}

export type Post = {
  id: string
  user_id: string
  title: string
  description: string | null
  image_a_url: string
  image_b_url?: string
  audience: 'public' | 'friends'
  is_active: boolean
  expires_at?: string
  created_at: string
  votes?: Vote[]
  profiles?: Profile | null
}

export type Vote = {
  id: string
  post_id: string
  voter_id: string
  value: boolean
  selected_option?: 'A' | 'B'
  comment?: string
  created_at: string
}

export type Friendship = {
  id: string
  requester_id: string
  receiver_id: string
  status: 'pending' | 'accepted'
  created_at: string
}

export type FriendRecord = Pick<Profile, 'id' | 'username' | 'avatar_url'> & {
  friendship_id: string
}

export type FriendshipWithProfiles = Friendship & {
  requester: Pick<Profile, 'id' | 'username' | 'avatar_url'>
  receiver: Pick<Profile, 'id' | 'username' | 'avatar_url'>
}

export type VoteStats = {
  yes: number
  no: number
  total: number
  pct: number
}

export type Report = {
  id: string
  reporter_id: string
  post_id: string
  reason: string
  created_at: string
}

export type BlockedUser = {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
}
