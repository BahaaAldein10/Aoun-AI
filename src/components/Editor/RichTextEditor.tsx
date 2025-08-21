import { SupportedLang } from "@/lib/dictionaries";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import { useEffect } from "react";
import MenuBar from "./MenuBar";

export interface RichTextEditorProps {
  content: string;
  onChange?: (html: string) => void;
  language: SupportedLang;
  disabled?: boolean;
  placeholder: string;
}

const RichTextEditor = ({
  content,
  onChange,
  language,
  disabled = false,
  placeholder,
}: RichTextEditorProps) => {
  const isArabic = language === "ar";

  const editor = useEditor({
    content,
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        // Ensure heading extension is enabled
        heading: {
          levels: [1, 2, 3],
          HTMLAttributes: {
            class: "heading-element", // Add class for custom styling if needed
          },
        },
        // Add RTL-aware spacing for lists
        bulletList: {
          HTMLAttributes: {
            class: `list-disc ${isArabic ? "mr-3" : "ml-3"}`,
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: `list-decimal ${isArabic ? "mr-3" : "ml-3"}`,
          },
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
        defaultAlignment: isArabic ? "right" : "left",
      }),
      // Add Underline extension
      Underline,
    ],
    editorProps: {
      attributes: {
        // Theme-aware surface styling using your globals.css variables
        class: clsx(
          "min-h-[156px] rounded-md py-2 px-3 w-full prose prose-sm max-w-none",
          "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "placeholder:text-[var(--muted-foreground)]",

          // Force all prose elements to use your foreground color
          "prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)]",
          "prose-strong:text-[var(--foreground)] prose-em:text-[var(--foreground)]",
          "prose-ul:text-[var(--foreground)] prose-ol:text-[var(--foreground)]",
          "prose-li:text-[var(--foreground)] prose-blockquote:text-[var(--foreground)]",

          // 🔥 Fix list marker color (numbers & bullets)
          "[&_ol]:marker:text-[var(--foreground)] [&_ul]:marker:text-[var(--foreground)]",

          // Heading styles
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6",
          "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-5",
          "[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2 [&_h3]:mt-4",
          "[&_p]:mb-3",
          "[&_ul]:mb-3 [&_ol]:mb-3",
          "[&_strong]:font-bold",
          "[&_em]:italic",
          "[&_u]:underline",
          "[&_s]:line-through",
        ),
        spellCheck: "true",
        dir: isArabic ? "rtl" : "ltr",
        placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Keep editor content in sync when `content` prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // Use setContent to avoid remounting; preserves selection if possible
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  // Respond to language/disabled changes without remounting editor
  useEffect(() => {
    if (!editor) return;

    // Update direction / placeholder at runtime
    editor.setOptions({
      editorProps: {
        attributes: {
          dir: isArabic ? "rtl" : "ltr",
          placeholder,
          spellCheck: "true",
          class: clsx(
            "min-h-[156px] rounded-md py-2 px-3 w-full prose prose-sm max-w-none",
            "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            "placeholder:text-[var(--muted-foreground)]",

            // Force all prose elements to use your foreground color
            "prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)]",
            "prose-strong:text-[var(--foreground)] prose-em:text-[var(--foreground)]",
            "prose-ul:text-[var(--foreground)] prose-ol:text-[var(--foreground)]",
            "prose-li:text-[var(--foreground)] prose-blockquote:text-[var(--foreground)]",

            // 🔥 Fix list marker color (numbers & bullets)
            "[&_ol]:marker:text-[var(--foreground)] [&_ul]:marker:text-[var(--foreground)]",

            // Heading styles
            "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6",
            "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-5",
            "[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2 [&_h3]:mt-4",
            "[&_p]:mb-3",
            "[&_ul]:mb-3 [&_ol]:mb-3",
            "[&_strong]:font-bold",
            "[&_em]:italic",
            "[&_u]:underline",
            "[&_s]:line-through",
          ),
        },
      },
    });

    // Toggle editable state
    editor.setEditable(!disabled);
  }, [editor, isArabic, disabled, placeholder]);

  if (!editor) return null;

  return (
    <div className="space-y-2">
      {!disabled && <MenuBar editor={editor} language={language} />}
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
