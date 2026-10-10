'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useToast } from '@/components/ui';
import styles from './RichTextEditor.module.css';

function ToolbarButton({ onClick, active, disabled, title, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-pressed={active || undefined}
            className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ''}`}
        >
            {children}
        </button>
    );
}

/**
 * The notice editor: a ruled sheet with a toolbar of words. Links are set
 * in a line under the toolbar rather than a browser prompt.
 */
export default function RichTextEditor({ value, onChange, placeholder = 'Write something…' }) {
    const fileInputRef = useRef(null);
    const toast = useToast();
    const [linking, setLinking] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Image.configure({ inline: false, allowBase64: false }),
            Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
        ],
        content: value || '',
        editorProps: {
            attributes: {
                class: styles.editor,
                'data-placeholder': placeholder,
            },
        },
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML());
        },
    });

    useEffect(() => {
        if (!editor) return;
        const current = editor.getHTML();
        if ((value || '') !== current) {
            editor.commands.setContent(value || '', false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, editor]);

    if (!editor) return <div className={styles.wrapper}><div className={styles.editor}>Loading the editor…</div></div>;

    const openLink = () => {
        setLinkUrl(editor.getAttributes('link').href || '');
        setLinking(true);
    };

    const applyLink = (e) => {
        e?.preventDefault();
        const url = linkUrl.trim();
        if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        setLinking(false);
    };

    const handleImageSelected = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/admin/announcements/upload-image', {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const t = await res.text();
                throw new Error(t || 'Upload failed');
            }
            const { url } = await res.json();
            editor.chain().focus().setImage({ src: url, alt: file.name }).run();
        } catch (err) {
            toast.error(`The image didn’t upload: ${err.message}`);
        }
    };

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><b>B</b></ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><i>I</i></ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></ToolbarButton>
                <span className={styles.divider} />
                <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading">Heading</ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Subheading">Sub</ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')} title="Paragraph">Text</ToolbarButton>
                <span className={styles.divider} />
                <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bulleted list">List</ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">1, 2, 3</ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">Quote</ToolbarButton>
                <span className={styles.divider} />
                <ToolbarButton onClick={openLink} active={editor.isActive('link') || linking} title="Link">Link</ToolbarButton>
                <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Insert an image">Image</ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="A rule across">Rule</ToolbarButton>
                <span className={styles.divider} />
                <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">Undo</ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">Redo</ToolbarButton>
            </div>
            {linking && (
                <form className={styles.linkRow} onSubmit={applyLink}>
                    <input
                        type="url"
                        className={styles.linkInput}
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://… (empty removes the link)"
                        aria-label="Link address"
                        autoFocus
                    />
                    <button type="submit" className={styles.toolBtn}>Apply</button>
                    <button type="button" className={styles.toolBtn} onClick={() => setLinking(false)}>Cancel</button>
                </form>
            )}
            <EditorContent editor={editor} />
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={handleImageSelected}
            />
        </div>
    );
}
