import { cn } from "@/lib/utils";
import { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Toggle } from "../ui/toggle";
import { SupportedLang } from "@/lib/dictionaries";

export default function MenuBar({
  editor,
  language,
}: {
  editor: Editor | null;
  language: SupportedLang;
}) {
  if (!editor) return null;

  const isArabic = language === "ar";

  const Options = [
    {
      icon: <Heading1 className="size-5" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      pressed: editor.isActive("heading", { level: 1 }),
      label: "H1",
    },
    {
      icon: <Heading2 className="size-5" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      pressed: editor.isActive("heading", { level: 2 }),
      label: "H2",
    },
    {
      icon: <Heading3 className="size-5" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      pressed: editor.isActive("heading", { level: 3 }),
      label: "H3",
    },
    {
      icon: <Bold className="size-5" />,
      onClick: () => editor.chain().focus().toggleBold().run(),
      pressed: editor.isActive("bold"),
      label: "Bold",
    },
    {
      icon: <Italic className="size-5" />,
      onClick: () => editor.chain().focus().toggleItalic().run(),
      pressed: editor.isActive("italic"),
      label: "Italic",
    },
    {
      icon: <Underline className="size-5" />,
      onClick: () => editor.chain().focus().toggleUnderline().run(),
      pressed: editor.isActive("underline"),
      label: "Underline",
    },
    {
      icon: <Strikethrough className="size-5" />,
      onClick: () => editor.chain().focus().toggleStrike().run(),
      pressed: editor.isActive("strike"),
      label: "Strike",
    },
    {
      icon: isArabic ? (
        <AlignRight className="size-5" />
      ) : (
        <AlignLeft className="size-5" />
      ),
      onClick: () =>
        editor
          .chain()
          .focus()
          .setTextAlign(isArabic ? "right" : "left")
          .run(),
      pressed: editor.isActive({ textAlign: isArabic ? "right" : "left" }),
      label: isArabic ? "محاذاة يمين" : "Align left",
    },
    {
      icon: <AlignCenter className="size-5" />,
      onClick: () => editor.chain().focus().setTextAlign("center").run(),
      pressed: editor.isActive({ textAlign: "center" }),
      label: "Center",
    },
    {
      icon: isArabic ? (
        <AlignLeft className="size-5" />
      ) : (
        <AlignRight className="size-5" />
      ),
      onClick: () =>
        editor
          .chain()
          .focus()
          .setTextAlign(isArabic ? "left" : "right")
          .run(),
      pressed: editor.isActive({ textAlign: isArabic ? "left" : "right" }),
      label: isArabic ? "محاذاة يسار" : "Align right",
    },
    {
      icon: <List className="size-5" />,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
      pressed: editor.isActive("bulletList"),
      label: "Bullets",
    },
    {
      icon: <ListOrdered className="size-5" />,
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
      pressed: editor.isActive("orderedList"),
      label: "Numbered",
    },
  ];

  return (
    <div
      // toolbar container uses css variables for bg/border/text so it respects light/dark theme
      className={cn(
        "z-50 mb-1 flex flex-wrap items-center gap-2 rounded-md p-2",
        // use css vars with Tailwind arbitrary values (Tailwind JIT)
        "bg-[var(--card)]",
        "border",
        "border-[var(--border)]",
        "text-[var(--foreground)]",
        "shadow-sm",
      )}
      dir={isArabic ? "rtl" : "ltr"}
      role="toolbar"
      aria-label="Editor toolbar"
    >
      {Options.map((option, index) => {
        const baseClasses =
          "inline-flex items-center justify-center p-2 rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

        // pressed: accent background + accent-foreground text
        const pressedClasses =
          "bg-[var(--accent)] text-[var(--accent-foreground)]";

        // not pressed: muted text, on hover use accent
        const notPressedClasses =
          "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]";

        return (
          <Toggle
            key={index}
            pressed={!!option.pressed}
            onPressedChange={option.onClick}
            aria-label={option.label}
            // pass visible classes; Toggle component should forward className to the button
            className={cn(
              baseClasses,
              option.pressed ? pressedClasses : notPressedClasses,
              "cursor-pointer",
            )}
          >
            {option.icon}
          </Toggle>
        );
      })}
    </div>
  );
}
