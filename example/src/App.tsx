import { useState } from "react";
import Editor from "./Editor";
import UserSelector from "./UserSelector";

function App() {
	const [user, setUser] = useState<{ name: string; color: string }>();

	return (
		<div className="w-full flex flex-col items-center p-6">
			<div className="flex w-full max-w-5xl flex-col gap-6">
				<header className="font-bold text-2xl">Y Durable Objects Example (Lexical)</header>

				{user ? (
					<Editor
						namespace="y-durable-objects-example-lexical"
						username={user.name}
						color={user.color}
					/>
				) : (
					<UserSelector onSubmit={setUser} />
				)}
			</div>
		</div>
	);
}

export default App;
