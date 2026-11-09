// Base44 stamps every entity record with `created_by` (the creating user's
// email) on the server. Reads must filter on this field so each account only
// ever sees the data it created — otherwise every user shares one global pool
// of Brands, Campaigns, Contacts, etc.
export function mine(user, extra = {}) {
  return { created_by: user?.email, ...extra };
}
