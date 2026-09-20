import Link from "next/link";
import InstallGuide from "@/components/InstallGuide";

export const metadata = { title: "Add lifeform to your home screen" };

// Public on purpose (see src/proxy.ts) so the link can be sent to someone who
// hasn't signed up yet: "open lifeform, then add it to your home screen".
export default function InstallPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-2xl font-bold text-white">Add lifeform to your home screen</h1>
      <p className="mt-1.5 text-sm text-zinc-400">
        It opens full-screen like a real app, and it&apos;s how you get notifications. Takes about 20 seconds.
      </p>
      <div className="mt-6">
        <InstallGuide />
      </div>
      <Link href="/" className="mt-8 block text-center text-sm font-medium text-emerald-400">
        Continue to lifeform →
      </Link>
    </div>
  );
}
