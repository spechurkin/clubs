import { tr, getLocale } from '../shared/i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  COLORS,
  hasDuplicateConnection,
  type Character,
  type CharacterFolder,
  type Circle,
  type Connection,
  type Database,
  type Portrait,
  type RelationType,
} from '../shared/model';
import { Avatar, ColorPicker, EmptyHint, Field } from './components';
import { defaultPortraitTransform, readPortrait } from './portrait';
import { PortraitEditor } from './PortraitEditor';
import { folderEntries, folderSubtree } from '../shared/folders';
import { sortByName } from './sorting';

type Actions = { onClose: () => void };
function FormError({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}
function Footer({
  onClose,
  label = tr('actions.save'),
  disabled,
}: Actions & { label?: string; disabled?: boolean }) {
  return (
    <div className="modal-footer">
      <button type="button" className="button secondary" onClick={onClose}>
        {tr('actions.cancel')}
      </button>
      <button className="button primary" disabled={disabled} type="submit">
        {label}
      </button>
    </div>
  );
}

export function CharacterForm({
  character,
  onSave,
  onClose,
  canAddToCircle,
  folders,
  initialFolderId = null,
}: Actions & {
  character?: Character;
  onSave: (character: Character, add: boolean) => void;
  canAddToCircle: boolean;
  folders: CharacterFolder[];
  initialFolderId?: string | null;
}) {
  const [name, setName] = useState(character?.name || '');
  const [color, setColor] = useState(character?.color || COLORS[0]);
  const [image, setImage] = useState(character?.image);
  const [portrait, setPortrait] = useState(character?.portrait);
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(null);
  const [notes, setNotes] = useState(character?.notes || '');
  const [folderId, setFolderId] = useState<string | null>(
    character ? character.folderId : initialFolderId,
  );
  const [add, setAdd] = useState(canAddToCircle && !character);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const wasEditingPortrait = useRef(false);
  useEffect(() => {
    if (wasEditingPortrait.current && !editingPortrait)
      (
        form.current?.querySelector<HTMLElement>('[data-edit-portrait]') ||
        form.current?.querySelector<HTMLElement>('input[type="file"]')
      )?.focus();
    wasEditingPortrait.current = !!editingPortrait;
  }, [editingPortrait]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reading) return;
    if (!name.trim()) {
      setError(tr('validation.characterNameRequired'));
      return;
    }
    onSave(
      {
        id: character?.id || crypto.randomUUID(),
        name: name.trim(),
        color,
        image,
        portrait,
        notes: notes.trim(),
        folderId,
      },
      add,
    );
  };
  if (editingPortrait)
    return (
      <PortraitEditor
        portrait={editingPortrait}
        onCancel={() => setEditingPortrait(null)}
        onApply={(image, portrait) => {
          setImage(image);
          setPortrait(portrait);
          setEditingPortrait(null);
          setError('');
        }}
      />
    );
  return (
    <form ref={form} onSubmit={submit}>
      <div className="portrait-editor">
        <Avatar character={{ name: name || '?', color, image }} size={84} />
        <div>
          <label className="button secondary upload-button">
            <ImagePlus size={16} />
            {image ? tr('portrait.replace') : tr('portrait.upload')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={tr('portrait.upload')}
              disabled={reading}
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                setReading(true);
                setError('');
                try {
                  setEditingPortrait({
                    source: await readPortrait(file),
                    ...defaultPortraitTransform(),
                  });
                } catch (error) {
                  setError(error instanceof Error ? error.message : tr('errors.image'));
                } finally {
                  setReading(false);
                  input.value = '';
                }
              }}
            />
          </label>
          {image ? (
            <div className="portrait-actions">
              <button
                type="button"
                className="text-button"
                data-edit-portrait
                disabled={reading}
                onClick={() =>
                  setEditingPortrait(portrait || { source: image, ...defaultPortraitTransform() })
                }
              >
                <Pencil size={13} />
                {tr('portrait.edit')}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={reading}
                onClick={() => {
                  setImage(undefined);
                  setPortrait(undefined);
                }}
              >
                <X size={13} />
                {tr('portrait.remove')}
              </button>
            </div>
          ) : (
            <p className="muted tiny">{tr('portrait.fileHint')}</p>
          )}
        </div>
      </div>
      <Field label={tr('characters.nameLabel')}>
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr('characters.namePlaceholder')}
          required
        />
      </Field>
      <Field label={tr('characters.folderLabel')}>
        <select
          aria-label={tr('characters.folderLabel')}
          value={folderId || ''}
          onChange={(e) => setFolderId(e.target.value || null)}
        >
          <option value="">{tr('folders.unfiled')}</option>
          {folderEntries(folders).map(({ folder, path }) => (
            <option key={folder.id} value={folder.id}>
              {path}
            </option>
          ))}
        </select>
      </Field>
      {!image && (
        <div className="field">
          <span className="field-label">{tr('characters.colorLabel')}</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      )}
      <Field label={tr('forms.notesLabel')} hint={tr('characters.notesHint')}>
        <textarea
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr('characters.notesPlaceholder')}
          rows={3}
        />
      </Field>
      {!character && canAddToCircle && (
        <label className="checkbox-row">
          <input type="checkbox" checked={add} onChange={(e) => setAdd(e.target.checked)} />
          <span>{tr('characters.addImmediately')}</span>
        </label>
      )}
      <FormError error={error} />
      <Footer
        onClose={onClose}
        disabled={reading}
        label={character ? tr('actions.saveChanges') : tr('characters.create')}
      />
    </form>
  );
}

export function FolderForm({
  folder,
  folders,
  initialParentId = null,
  onSave,
  onClose,
}: Actions & {
  folder?: CharacterFolder;
  folders: CharacterFolder[];
  initialParentId?: string | null;
  onSave: (folder: CharacterFolder) => void;
}) {
  const [name, setName] = useState(folder?.name || '');
  const [parentId, setParentId] = useState<string | null>(
    folder ? folder.parentId : initialParentId,
  );
  const excluded = folder ? folderSubtree(folders, folder.id) : new Set<string>();
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
          setError(tr('validation.folderNameRequired'));
          return;
        }
        if (
          folders.some(
            (item) =>
              item.id !== folder?.id &&
              item.parentId === parentId &&
              item.name.toLocaleLowerCase('ru') === trimmed.toLocaleLowerCase('ru'),
          )
        ) {
          setError(tr('validation.folderNameExists'));
          return;
        }
        if (!folder && folders.length >= 500) {
          setError(tr('validation.folderLimit'));
          return;
        }
        if (
          parentId !== null &&
          (excluded.has(parentId) || !folders.some((item) => item.id === parentId))
        ) {
          setError(tr('validation.folderParentInvalid'));
          return;
        }
        onSave({ id: folder?.id || crypto.randomUUID(), name: trimmed, parentId });
      }}
    >
      <Field label={tr('folders.nameLabel')}>
        <input
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={tr('folders.namePlaceholder')}
          required
        />
      </Field>
      <Field label={tr('folders.parentLabel')}>
        <select
          aria-label={tr('folders.parentLabel')}
          value={parentId || ''}
          onChange={(event) => setParentId(event.target.value || null)}
        >
          <option value="">{tr('folders.libraryRoot')}</option>
          {folderEntries(folders)
            .filter(({ folder }) => !excluded.has(folder.id))
            .map(({ folder, path }) => (
              <option key={folder.id} value={folder.id}>
                {path}
              </option>
            ))}
        </select>
      </Field>
      <p className="field-hint">{tr('folders.reparentHint')}</p>
      <FormError error={error} />
      <Footer onClose={onClose} label={folder ? tr('actions.saveChanges') : tr('folders.create')} />
    </form>
  );
}

export function TypeForm({
  type,
  types,
  onSave,
  onClose,
}: Actions & { type?: RelationType; types: RelationType[]; onSave: (type: RelationType) => void }) {
  const [name, setName] = useState(type?.name || '');
  const [color, setColor] = useState(type?.color || COLORS[types.length % COLORS.length]);
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          setError(tr('validation.relationshipNameRequired'));
          return;
        }
        if (
          types.some(
            (t) =>
              t.id !== type?.id &&
              t.name.toLocaleLowerCase('ru') === name.trim().toLocaleLowerCase('ru'),
          )
        ) {
          setError(tr('validation.relationshipNameExists'));
          return;
        }
        onSave({ id: type?.id || crypto.randomUUID(), name: name.trim(), color });
      }}
    >
      <Field label={tr('relationships.nameLabel')}>
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr('relationships.namePlaceholder')}
          required
        />
      </Field>
      <div className="field">
        <span className="field-label">{tr('relationships.colorLabel')}</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="relation-preview">
        <span style={{ background: color }} />
        <span style={{ borderColor: color, background: `${color}22` }} />
        <i style={{ background: color }} />
        <span style={{ borderColor: color, background: `${color}22` }} />
        <strong>{name || tr('relationships.previewName')}</strong>
      </div>
      <FormError error={error} />
      <Footer
        onClose={onClose}
        label={type ? tr('actions.saveChanges') : tr('relationships.create')}
      />
    </form>
  );
}

export function CircleForm({
  circle,
  onSave,
  onClose,
}: Actions & { circle?: Circle; onSave: (circle: Circle) => void }) {
  const [name, setName] = useState(circle?.name || '');
  const [description, setDescription] = useState(circle?.description || '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim())
          onSave({
            id: circle?.id || crypto.randomUUID(),
            name: name.trim(),
            description: description.trim(),
            characterIds: circle?.characterIds || [],
            connections: circle?.connections || [],
          });
      }}
    >
      <Field label={tr('circles.nameLabel')}>
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr('circles.namePlaceholder')}
          required
        />
      </Field>
      <Field label={tr('forms.descriptionLabel')} hint={tr('circles.descriptionHint')}>
        <textarea
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tr('circles.descriptionPlaceholder')}
          rows={3}
        />
      </Field>
      <Footer onClose={onClose} label={circle ? tr('actions.saveChanges') : tr('circles.create')} />
    </form>
  );
}

export function ConnectionForm({
  connection,
  circle,
  data,
  sourceId,
  targetId,
  onSave,
  onClose,
  onNewType,
}: Actions & {
  connection?: Connection;
  circle: Circle;
  data: Database;
  sourceId?: string;
  targetId?: string;
  onSave: (edge: Connection) => void;
  onNewType: () => void;
}) {
  const [source, setSource] = useState(
    connection?.sourceId || sourceId || circle.characterIds[0] || '',
  );
  const [target, setTarget] = useState(
    connection?.targetId ||
      targetId ||
      circle.characterIds.find((id) => id !== (sourceId || circle.characterIds[0])) ||
      '',
  );
  const [type, setType] = useState(connection?.typeId || data.relationTypes[0]?.id || '');
  const [directed, setDirected] = useState(connection?.directed || false);
  const [notes, setNotes] = useState(connection?.notes || '');
  const [error, setError] = useState('');
  const memberOptions = sortByName(
    data.characters.filter((character) => circle.characterIds.includes(character.id)),
  ).map((character) => (
    <option key={character.id} value={character.id}>
      {character.name}
    </option>
  ));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!source || !target || source === target) {
          setError(tr('validation.differentCharactersRequired'));
          return;
        }
        if (!type) {
          setError(tr('validation.relationshipTypeRequired'));
          return;
        }
        const edge: Connection = {
          id: connection?.id || crypto.randomUUID(),
          sourceId: source,
          targetId: target,
          typeId: type,
          directed,
          notes: notes.trim(),
        };
        if (hasDuplicateConnection(circle, edge)) {
          setError(tr('validation.duplicateConnectionHint'));
          return;
        }
        onSave(edge);
      }}
    >
      <div className="pair-fields">
        <Field label={tr('connections.sourceLabel')}>
          <select value={source} onChange={(e) => setSource(e.target.value)} required>
            {memberOptions}
          </select>
        </Field>
        <ArrowRight size={18} />
        <Field label={tr('connections.targetLabel')}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} required>
            {memberOptions}
          </select>
        </Field>
      </div>
      {data.relationTypes.length ? (
        <Field label={tr('relationships.label')}>
          <select value={type} onChange={(e) => setType(e.target.value)} required>
            {sortByName(data.relationTypes).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="inline-callout">
          <p>{tr('relationships.nameColorHint')}</p>
          <button className="button secondary" type="button" onClick={onNewType}>
            <Plus size={16} />
            {tr('relationships.create')}
          </button>
        </div>
      )}
      <label className="checkbox-row">
        <input type="checkbox" checked={directed} onChange={(e) => setDirected(e.target.checked)} />
        <span>
          {tr('connections.directionLabel')}
          <small>{directed ? tr('connections.directionHint') : tr('connections.mutualHint')}</small>
        </span>
      </label>
      <Field label={tr('connections.notesLabel')}>
        <textarea
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr('connections.notesPlaceholder')}
          rows={3}
        />
      </Field>
      <FormError error={error} />
      <Footer
        onClose={onClose}
        disabled={circle.characterIds.length < 2 || !data.relationTypes.length}
        label={connection ? tr('actions.saveChanges') : tr('connections.add')}
      />
    </form>
  );
}

export function ParticipantsForm({
  circle,
  characters,
  folders,
  onSave,
  onClose,
  onNewCharacter,
}: Actions & {
  circle: Circle;
  characters: Character[];
  folders: CharacterFolder[];
  onSave: (ids: string[]) => void;
  onNewCharacter: () => void;
}) {
  const [selected, setSelected] = useState(new Set(circle.characterIds));
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const subtree =
    folderFilter && folderFilter !== ':unfiled'
      ? folderSubtree(folders, folderFilter)
      : new Set<string>();
  const filtered = sortByName(
    characters.filter(
      (c) =>
        c.name.toLocaleLowerCase(getLocale()).includes(search.toLocaleLowerCase(getLocale())) &&
        (!folderFilter ||
          (folderFilter === ':unfiled'
            ? c.folderId === null
            : c.folderId !== null && subtree.has(c.folderId))),
    ),
  );
  const groups = [
    ...folderEntries(folders).map(({ folder, path }) => ({ ...folder, name: path })),
    { id: ':unfiled', name: tr('folders.unfiled') },
  ]
    .map((folder) => ({
      ...folder,
      characters: filtered.filter(
        (character) => character.folderId === (folder.id === ':unfiled' ? null : folder.id),
      ),
    }))
    .filter((group) => group.characters.length > 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave([
          ...circle.characterIds.filter((id) => selected.has(id)),
          ...characters
            .filter((c) => selected.has(c.id) && !circle.characterIds.includes(c.id))
            .map((c) => c.id),
        ]);
      }}
    >
      <div className="search-input">
        <Search size={16} />
        <input
          aria-label={tr('members.searchLabel')}
          placeholder={tr('members.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label={tr('members.folderLabel')}>
          <select
            aria-label={tr('members.folderLabel')}
            value={folderFilter}
            onChange={(event) => setFolderFilter(event.target.value)}
          >
            <option value="">{tr('folders.all')}</option>
            <option value=":unfiled">{tr('folders.unfiled')}</option>
            {folderEntries(folders).map(({ folder, path }) => (
              <option key={folder.id} value={folder.id}>
                {path}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="participant-picker">
        {groups.map((group) => (
          <div className="picker-group" key={group.id}>
            <h3>
              {group.name}
              <span>{group.characters.length}</span>
            </h3>
            {group.characters.map((character) => (
              <label
                key={character.id}
                className={`picker-row ${selected.has(character.id) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(character.id)}
                  onChange={(e) =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (e.target.checked) next.add(character.id);
                      else next.delete(character.id);
                      return next;
                    })
                  }
                />
                <Avatar character={character} />
                <span>
                  <strong>{character.name}</strong>
                  <small>{character.notes || tr('members.libraryCharacter')}</small>
                </span>
              </label>
            ))}
          </div>
        ))}
        {!filtered.length && (
          <EmptyHint>
            {characters.length
              ? tr('members.noSearchResults')
              : tr('characters.noLibraryCharacters')}
          </EmptyHint>
        )}
      </div>
      <button className="text-button" type="button" onClick={onNewCharacter}>
        <Plus size={16} />
        {tr('characters.createNew')}
      </button>
      {circle.characterIds.some((id) => !selected.has(id)) && (
        <p className="field-hint">
          <Trash2 size={12} />
          {tr('members.removalHint')}
        </p>
      )}
      <Footer
        onClose={onClose}
        label={tr('members.applySelection', selected.size)}
        disabled={selected.size > 500}
      />
    </form>
  );
}
