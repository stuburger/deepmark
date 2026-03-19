import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function HomePage() {
	if (!(await auth())) {
		redirect("/login")
	}

	redirect("/teacher/mark")
}
