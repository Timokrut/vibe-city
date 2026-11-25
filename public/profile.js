// Only the small JPEG thumbnail travels with a room. The original stays local.
export const nicknameLimit = 24;
export const avatarLimit = 24000;

export function readProfile(value = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid profile");
  const { nickname = "", avatar = "" } = value;
  if (
    typeof nickname !== "string" ||
    nickname.length > nicknameLimit ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(nickname)
  )
    throw new TypeError("Invalid nickname");
  if (
    typeof avatar !== "string" ||
    avatar.length > avatarLimit ||
    (avatar &&
      !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(avatar))
  )
    throw new TypeError("Invalid avatar");
  return { nickname: nickname.trim(), avatar };
}
