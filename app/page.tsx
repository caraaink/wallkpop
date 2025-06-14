import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-8">WallKPop MP3 Blog</h1>
      <div className="space-y-4">
        <Link href="/panel" className="block text-blue-600 hover:underline">
          Go to Admin Panel
        </Link>
        <Link href="/search" className="block text-blue-600 hover:underline">
          Search Songs
        </Link>
      </div>
    </div>
  );
}
