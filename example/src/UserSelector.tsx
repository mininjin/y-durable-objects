import { useState } from "react";

type Props = {
	onSubmit: (u: { name: string; color: string }) => void;
};

const COLORS = [
	"#FF0000",
	"#FFA500",
	"#FFFF00",
	"#008000",
	"#0000FF",
	"#4B0082",
	"#EE82EE",
];

const UserSelector = (props: Props) => {
	const [username, setUsername] = useState("");
	const [color, setColor] = useState(COLORS[0]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-3">
				<label htmlFor="username">User name</label>

				<input
					id="username"
					type="text"
					placeholder="Enter user name"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					className="p-2 border border-gray-300 rounded"
				/>
			</div>

			<div className="flex gap-4">
				{COLORS.map((c) => (
					<button
						key={c}
						className={`w-8 h-8 rounded-full border-2 ${
							color === c ? "border-black" : ""
						}`}
						style={{ backgroundColor: c }}
						onClick={() => setColor(c)}
					/>
				))}
			</div>

			<button
				onClick={() => props.onSubmit({ name: username, color })}
				className="p-2 bg-blue-500 text-white rounded"
			>
				Save User
			</button>
		</div>
	);
};

export default UserSelector;
