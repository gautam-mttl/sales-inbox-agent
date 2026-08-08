export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Sales Inbox → Task Router
        </h1>
        <p className="text-gray-400 text-sm">
          ALUMNX AI LABS · Phase 1 scaffold — UI coming in Phase 9
        </p>
        <p className="text-gray-500 text-xs">
          Backend health:{" "}
          <a
            href="/health"
            className="text-blue-400 underline hover:text-blue-300"
          >
            /health
          </a>
        </p>
      </div>
    </div>
  );
}
