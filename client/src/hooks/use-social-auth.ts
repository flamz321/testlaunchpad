// Re-export everything from the global context so all existing imports continue
// to work unchanged. The real implementation lives in SocialAuthContext.tsx.
export {
  useSocialAuth,
  socialAuthHeaders,
  avatarUrl,
  initials,
  type SocialProfile,
  type SocialAuthState,
} from "@/contexts/SocialAuthContext";
