import { DEFAULT_AUTH_USERS } from "../src/lib/auth";
import { createAdminClient } from "../src/lib/db/supabase";

async function main() {
  const supabase = createAdminClient();
  const {
    data: { users: existingUsers },
    error: listError,
  } = await supabase.auth.admin.listUsers();

  if (listError) {
    throw listError;
  }

  const usersByEmail = new Map(
    (existingUsers ?? [])
      .filter((user) => user.email)
      .map((user) => [user.email as string, user])
  );

  for (const defaultUser of DEFAULT_AUTH_USERS) {
    const existingUser = usersByEmail.get(defaultUser.email);

    if (existingUser) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          password: defaultUser.password,
          email_confirm: true,
          app_metadata: { role: defaultUser.role },
          user_metadata: { full_name: defaultUser.fullName, role: defaultUser.role },
        }
      );

      if (updateError) throw updateError;
    } else {
      const { error: createError } = await supabase.auth.admin.createUser({
        email: defaultUser.email,
        password: defaultUser.password,
        email_confirm: true,
        app_metadata: { role: defaultUser.role },
        user_metadata: { full_name: defaultUser.fullName, role: defaultUser.role },
      });

      if (createError) throw createError;
    }
  }

  const {
    data: { users: syncedUsers },
    error: refetchError,
  } = await supabase.auth.admin.listUsers();

  if (refetchError) {
    throw refetchError;
  }

  const profileRows = (syncedUsers ?? [])
    .filter((user) =>
      DEFAULT_AUTH_USERS.some((defaultUser) => defaultUser.email === user.email)
    )
    .map((user) => ({
      id: user.id,
      email: user.email ?? "",
      full_name:
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split("@")[0] ??
        "Anima Cura",
      role: (user.app_metadata?.role as string | undefined) ?? "lesezugriff",
    }));

  const { error: upsertError } = await supabase
    .from("user_profiles")
    .upsert(profileRows, { onConflict: "id" });

  if (upsertError) {
    throw upsertError;
  }

  console.log(`Seeded ${profileRows.length} auth users.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
