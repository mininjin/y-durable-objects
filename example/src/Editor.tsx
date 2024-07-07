import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { EditorThemeClasses } from "lexical";
import { WebsocketProvider } from "y-websocket";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { Doc } from "yjs";
import { Provider } from "@lexical/yjs";
import { QuoteNode, HeadingNode } from "@lexical/rich-text";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { ListNode, ListItemNode } from "@lexical/list";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import {
	AutoLinkPlugin,
	LinkMatcher,
} from "@lexical/react/LexicalAutoLinkPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { CodeNode } from "@lexical/code";

const theme: EditorThemeClasses = {
	link: "text-link",
	heading: {
		h1: "border-b pb-4 mb-4 pt-8 text-xl font-bold",
		h2: "py-2 text-lg font-bold",
		h3: "py-2 text-base font-bold",
		h4: "py-2 text-sm font-bold",
		h5: "py-2 text-xs font-bold",
		h6: "py-2 text-xs font-bold",
	},
	list: {
		ul: "lexical-ul",
		olDepth: [
			"lexical-ol1",
			"lexical-ol2",
			"lexical-ol3",
			"lexical-ol4",
			"lexical-ol5",
		],
		ol: "lexical-ol",
		nested: {
			listitem: "list-none",
		},
	},
	text: {
		bold: "font-bold",
		italic: "italic",
		underline: "underline",
		strikethrough: "line-through",
	},
};

function onError(error: Error) {
	console.error(error);
}

type Props = {
	namespace: string;
	username: string;
	color: string;
};

const Editor = (props: Props) => {
	return (
		<LexicalComposer
			initialConfig={{
				namespace: props.namespace,
				theme,
				onError,
				nodes: [
					HorizontalRuleNode,
					HeadingNode,
					QuoteNode,
					ListNode,
					ListItemNode,
					LinkNode,
					CodeNode,
					AutoLinkNode,
				],
				editorState: null,
			}}
		>
			<RichTextPlugin
				contentEditable={
					<ContentEditable className="size-full border p-2 rounded-lg outline-none focus-within:border-current" />
				}
				placeholder={<div>Enter some text...</div>}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<AutoFocusPlugin />
			<MarkdownShortcutPlugin />
			<ListPlugin />
			<TabIndentationPlugin />
			<LinkPlugin />
			<AutoLinkPlugin matchers={MATCHERS} />

			<CollaborationPlugin
				id={props.namespace}
				providerFactory={yjsProviderFactory}
				shouldBootstrap={false}
				username={props.username}
				cursorColor={props.color}
				initialEditorState={null}
			/>
		</LexicalComposer>
	);
};

const URL_MATCHER =
	/((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;
const MATCHERS: LinkMatcher[] = [
	(text: string) => {
		const match = URL_MATCHER.exec(text);
		if (match === null) {
			return null;
		}
		const fullMatch = match[0];
		return {
			index: match.index,
			length: fullMatch.length,
			text: fullMatch,
			url: fullMatch.startsWith("http") ? fullMatch : `https://${fullMatch}`,
			attributes: { rel: "noreferrer noopener", target: "_blank" },
		};
	},
];

const yjsProviderFactory = (
	id: string,
	yjsDocMap: Map<string, Doc>
): Provider => {
	const doc = getDocFromMap(id, yjsDocMap);

	// new IndexeddbPersistence(id, doc);

	const provider = new WebsocketProvider(`ws://localhost:8787`, id, doc, {
		connect: false,
	});

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-expect-error
	return provider;
};

const getDocFromMap = (id: string, yjsDocMap: Map<string, Doc>): Doc => {
	let doc = yjsDocMap.get(id);

	if (doc === undefined) {
		doc = new Doc();
		yjsDocMap.set(id, doc);
	} else {
		doc.load();
	}

	return doc;
};

export default Editor;
