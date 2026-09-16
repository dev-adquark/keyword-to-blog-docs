import { redirect } from "next/navigation";

// This is an internal, admin-provisioned application — there is no public
// account registration. Team accounts are created via scripts/provisionTeam.mjs.
export default function SignupPage() {
  redirect("/login");
}
