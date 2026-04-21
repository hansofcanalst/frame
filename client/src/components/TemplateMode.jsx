import { useState, useEffect, useCallback } from 'react';
import TemplateGallery from './TemplateGallery.jsx';
import TemplateBuilder from './TemplateBuilder.jsx';
import TemplateEditor  from './TemplateEditor.jsx';

export default function TemplateMode() {
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(true);

  // 'gallery' | 'builder' | 'editor'
  const [view, setView]             = useState('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState(null); // builder
  const [editingTemplate, setEditingTemplate]   = useState(null); // editor (null = new)

  // ── Fetch (and refresh) template list ───────────────────────────────────

  const fetchTemplates = useCallback(() => {
    return fetch('/api/templates')
      .then(r => r.json())
      .then(data => {
        setTemplates(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // ── Navigation helpers ───────────────────────────────────────────────────

  const openBuilder = (template) => {
    setSelectedTemplate(template);
    setView('builder');
  };

  const openEditor = (template = null) => {
    setEditingTemplate(template); // null → new template
    setView('editor');
  };

  // Called after a save or delete in the editor
  const handleEditorSaved = async (savedTemplate) => {
    // Refresh the gallery so changes appear immediately
    await fetchTemplates();
    setView('gallery');
    setEditingTemplate(null);
  };

  const goToGallery = () => {
    setView('gallery');
    setSelectedTemplate(null);
    setEditingTemplate(null);
  };

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p className="text-ink-muted text-sm">Loading templates…</p>
      </div>
    );
  }

  // ── Views ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full">

      {/* ── Gallery ── */}
      {view === 'gallery' && (
        <>
          <div className="text-center space-y-2 pt-4 mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              Video <span className="text-accent">Templates.</span>
            </h1>
            <p className="text-ink-muted text-base max-w-lg mx-auto">
              Choose a template, upload your clips, and get a polished video in minutes.
            </p>
          </div>
          <TemplateGallery
            templates={templates}
            onSelect={openBuilder}
            onEdit={openEditor}
            onNew={() => openEditor(null)}
          />
        </>
      )}

      {/* ── Builder ── */}
      {view === 'builder' && selectedTemplate && (
        <TemplateBuilder template={selectedTemplate} onBack={goToGallery} />
      )}

      {/* ── Editor ── */}
      {view === 'editor' && (
        <TemplateEditor
          templateData={editingTemplate}
          onBack={goToGallery}
          onSaved={handleEditorSaved}
        />
      )}
    </div>
  );
}
