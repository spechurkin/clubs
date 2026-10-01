import {getLocale, isLocale, setLocale, subscribeLocale, tr} from '../shared/i18n';
import {version as appVersion} from '../package.json';
import {type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore,} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle as ClubIcon,
  CircleDot as ClubDot,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Link2,
  LoaderCircle as LoadingIcon,
  Maximize,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  type Character,
  type CharacterFolder,
  type Club,
  type Database,
  deleteCharacter,
  deleteCharacterFolder,
  deleteRelationType,
  type RelationType,
  removeFromClub,
} from '../shared/model';
import {
  createCharactersTransfer,
  createRelationsTransfer,
  createStoriesTransfer,
  describeImport,
  type TransferPackage,
} from '../shared/transfer';
import {folderPath, folderSubtree} from '../shared/folders';
import {Avatar, EmptyHint, Modal, ScrollArea} from './components';
import {CharacterForm, ClubForm, ConnectionForm, FolderForm, ParticipantsForm, TypeForm,} from './forms';
import CharacterLibrary from './CharacterLibrary';
import Diagram from './Diagram';
import {demoDatabase} from './demo';
import {storage} from './storage';
import {useLibrary} from './useLibrary';
import {sortByName, sortConnections} from './sorting';

type View = 'clubs' | 'characters' | 'relations' | 'settings';
type Editor = {
    kind: 'character' | 'folder' | 'type' | 'club' | 'participants' | 'connection';
  id?: string;
  sourceId?: string;
  targetId?: string;
  parentId?: string | null;
};
type Confirmation = { title: string; text: string; action: () => void };

function OrbitMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="1.3" />
      <path d="M20 7L31.3 26.5H8.7L20 7Z" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      <circle cx="20" cy="7" r="3.5" fill="currentColor" />
      <circle cx="31.3" cy="26.5" r="3.5" fill="currentColor" />
      <circle cx="8.7" cy="26.5" r="3.5" fill="currentColor" />
    </svg>
  );
}
function Count({ children }: { children: ReactNode }) {
  return <span className="count">{children}</span>;
}

export default function App() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = tr('app.name');
  }, [locale]);
  const library = useLibrary();
  const { data, commit } = library;
    const [view, setView] = useState<View>('clubs');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string>();
  const [selectedEdge, setSelectedEdge] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<'members' | 'connections'>('members');
  const inspectorPositions = useRef(new Map<string, number>());
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState(new Set<string>());
  const [labels, setLabels] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
    const attachDiagramWheel = useCallback((viewport: HTMLDivElement | null) => {
        if (!viewport) return;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const deltaX =
                event.deltaX *
                (event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? 16
                    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                        ? viewport.clientWidth
                        : 1);
            const deltaY =
                event.deltaY *
                (event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? 16
                    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                        ? viewport.clientHeight
                        : 1);
            if (event.ctrlKey || event.metaKey) {
                setZoom((current) => Math.max(0.5, Math.min(2.5, current * Math.exp(-deltaY * 0.002))));
                return;
            }
            const horizontal = event.shiftKey && deltaX === 0;
            setPan((current) => ({
                x: current.x - (horizontal ? deltaY : deltaX),
                y: current.y - (horizontal ? 0 : deltaY),
            }));
        };
        // Cancel native scrolling and browser zoom only over the diagram.
        viewport.addEventListener('wheel', wheel, {passive: false});
        return () => viewport.removeEventListener('wheel', wheel);
    }, []);
  const [linking, setLinking] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
    const [clubMenu, setClubMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
    const club = data?.clubs.find((c) => c.id === data.activeClubId) || data?.clubs[0];
  const character = data?.characters.find((c) => c.id === selectedCharacter);
    const edge = club?.connections.find((e) => e.id === selectedEdge);
  const closeEditor = useCallback(() => setEditor(null), []);
  const clearSelection = () => {
    setSelectedCharacter(undefined);
    setSelectedEdge(undefined);
  };
  const notify = (message: string) => setToast(message);

  useEffect(() => {
    clearSelection();
    setHiddenTypes(new Set());
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLinking(false);
      setClubMenu(false);
  }, [club?.id]);
  useEffect(() => {
    if (
      data &&
      activeFolder &&
      activeFolder !== ':unfiled' &&
      !data.folders.some((folder) => folder.id === activeFolder)
    ) {
      setActiveFolder('');
    }
  }, [data?.folders, activeFolder]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection();
        setLinking(false);
        setExportMenu(false);
          setClubMenu(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void library
          .flush()
          .then(() => notify(tr('notifications.librarySaved')))
          .catch((error) => notify(String(error)));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [library.flush]);

    const updateClub = (update: (club: Club) => Club) => {
        if (club)
      commit((data) => ({
        ...data,
          clubs: data.clubs.map((c) => (c.id === club.id ? update(c) : c)),
      }));
  };
  const changeView = (next: View) => {
    setView(next);
    setSearch('');
    setExportMenu(false);
      setClubMenu(false);
  };
  const newCharacter = () => setEditor({ kind: 'character' });
  const newFolder = () =>
    setEditor({
      kind: 'folder',
      parentId: activeFolder && activeFolder !== ':unfiled' ? activeFolder : null,
    });
  const newType = () => setEditor({ kind: 'type' });
  const newConnection = () => {
      if (!club || club.characterIds.length < 2) {
      setEditor({ kind: 'participants' });
      return;
    }
    setEditor({ kind: 'connection', sourceId: selectedCharacter });
  };
  const saveCharacter = (character: Character, add: boolean) => {
    commit((data) => ({
      ...data,
      characters: data.characters.some((c) => c.id === character.id)
        ? data.characters.map((c) => (c.id === character.id ? character : c))
        : [...data.characters, character],
        clubs:
            add && club
                ? data.clubs.map((c) =>
                    c.id === club.id && !c.characterIds.includes(character.id)
                ? { ...c, characterIds: [...c.characterIds, character.id] }
                : c,
            )
                : data.clubs,
    }));
    closeEditor();
    notify(tr('notifications.characterSaved'));
  };
  const saveType = (type: RelationType) => {
    commit((data) => ({
      ...data,
      relationTypes: data.relationTypes.some((t) => t.id === type.id)
        ? data.relationTypes.map((t) => (t.id === type.id ? type : t))
        : [...data.relationTypes, type],
    }));
    closeEditor();
    notify(tr('notifications.relationshipSaved'));
  };
  const saveFolder = (folder: CharacterFolder) => {
    commit((data) => ({
      ...data,
      folders: data.folders.some((item) => item.id === folder.id)
        ? data.folders.map((item) => (item.id === folder.id ? folder : item))
        : [...data.folders, folder],
    }));
    setActiveFolder(folder.id);
    closeEditor();
    notify(tr('notifications.folderSaved'));
  };
  const askDeleteFolder = (folder: CharacterFolder) => {
    if (!data) return;
    const removed = folderSubtree(data.folders, folder.id);
    const destination = folder.parentId
      ? folderPath(data.folders, folder.parentId)
      : tr('folders.unfiled');
    setConfirmation({
      title: removed.size > 1 ? tr('folders.deleteBranchTitle') : tr('folders.deleteTitle'),
      text: tr(
        'folders.deleteMessage',
        folderPath(data.folders, folder.id),
        removed.size > 1
          ? tr('folders.deleteBranchSuffix', removed.size - 1)
          : tr('folders.deleteSingleSuffix'),
        destination,
      ),
      action: () => {
        commit((data) => deleteCharacterFolder(data, folder.id));
        if (removed.has(activeFolder)) setActiveFolder(folder.parentId || ':unfiled');
      },
    });
  };
    const saveClub = (next: Club) => {
    commit((data) => ({
      ...data,
        clubs: data.clubs.some((c) => c.id === next.id)
            ? data.clubs.map((c) => (c.id === next.id ? next : c))
            : [...data.clubs, next],
        activeClubId: next.id,
    }));
        setView('clubs');
    closeEditor();
  };
  const askDeleteCharacter = (character: Character) =>
    setConfirmation({
      title: tr('characters.deleteTitle'),
      text: tr('characters.deleteMessage', character.name),
      action: () => {
        commit((data) => deleteCharacter(data, character.id));
        clearSelection();
      },
    });
  const askDeleteType = (type: RelationType) =>
    setConfirmation({
      title: tr('relationships.deleteTitle'),
      text: tr('relationships.deleteMessage', type.name),
      action: () => {
        commit((data) => deleteRelationType(data, type.id));
        clearSelection();
      },
    });
  const importBackup = async () => {
    setBusy(true);
    try {
      await library.flush();
      const result = await storage.importBackup();
      if (result) {
        library.adopt(result);
        clearSelection();
        notify(tr('notifications.libraryImported'));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : tr('errors.libraryImport'));
    } finally {
      setBusy(false);
    }
  };
  const exportJSON = async (file: TransferPackage, name: string) => {
    setExportMenu(false);
    setBusy(true);
    try {
      if (await storage.exportTransfer(file, name)) notify(tr('notifications.jsonSaved'));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr('errors.dataExport'));
    } finally {
      setBusy(false);
    }
  };
  const importJSON = async () => {
    setExportMenu(false);
    setBusy(true);
    try {
      await library.flush();
      const result = await storage.importTransfer();
      if (result) {
        library.adopt(result);
        clearSelection();
        notify(describeImport(result.summary));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : tr('errors.dataImport'));
    } finally {
      setBusy(false);
    }
  };
  const makeExport = async (format: 'png' | 'svg') => {
      if (!data || !club) return;
    setExportMenu(false);
    setBusy(true);
    try {
      const { exportDiagram } = await import('./export');
        if (await exportDiagram(data, club, format, labels))
        notify(tr('notifications.diagramSaved', format.toUpperCase()));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr('errors.diagramExport'));
    } finally {
      setBusy(false);
    }
  };
  const pickCharacter = (id: string) => {
    if (linking && selectedCharacter && selectedCharacter !== id) {
      setEditor({ kind: 'connection', sourceId: selectedCharacter, targetId: id });
      setLinking(false);
    }
    setSelectedCharacter(id);
    setSelectedEdge(undefined);
  };
  const reorder = (id: string, direction: number) =>
      updateClub((club) => {
          const ids = [...club.characterIds];
      const index = ids.indexOf(id);
      const next = index + direction;
          if (next < 0 || next >= ids.length) return club;
      [ids[index], ids[next]] = [ids[next], ids[index]];
          return {...club, characterIds: ids};
    });

  if (!data)
    return (
      <div className="loading-screen">
        <OrbitMark size={54} />
        <h1>{tr('app.name')}</h1>
        {library.status === 'loading' ? (
          <>
              <LoadingIcon className="spin" size={24}/>
            <p>{tr('library.opening')}</p>
          </>
        ) : (
          <>
            <p className="form-error">{library.error}</p>
            <div className="button-row">
              <button className="button secondary" onClick={() => void library.load()}>
                {tr('actions.tryAgain')}
              </button>
              <button className="button primary" onClick={() => void importBackup()}>
                {tr('actions.importBackup')}
              </button>
            </div>
          </>
        )}
      </div>
    );

  const relationTypes = sortByName(data.relationTypes);
  const members = sortByName(
      data.characters.filter((character) => club?.characterIds.includes(character.id)),
  );
    const connections = sortConnections(club?.connections || [], data);
  const title =
      view === 'clubs'
          ? club?.name || tr('clubs.emptyTitle')
      : view === 'characters'
        ? tr('characters.libraryTitle')
        : view === 'relations'
          ? tr('relationships.paletteTitle')
          : tr('settings.title');
  const subtitle =
      view === 'clubs'
          ? club?.description || tr('clubs.subtitle')
      : view === 'characters'
        ? tr('characters.subtitle')
        : view === 'relations'
          ? tr('relationships.subtitle')
          : tr('settings.subtitle');

  return (
    <div className="app-shell">
      <nav className="rail" aria-label={tr('navigation.mainLabel')}>
        <button
          className="brand-mark"
          aria-label={tr('app.name')}
          onClick={() => changeView('clubs')}
        >
          <OrbitMark size={36} />
        </button>
        <div className="rail-links">
          {(
            [
                ['clubs', ClubDot, tr('navigation.clubs')],
              ['characters', Users, tr('navigation.characters')],
              ['relations', Link2, tr('navigation.relationships')],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              className={`rail-button ${view === id ? 'active' : ''}`}
              onClick={() => changeView(id)}
              aria-label={label}
              title={label}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <button
            className={`rail-button ${view === 'settings' ? 'active' : ''}`}
            aria-label={tr('navigation.settings')}
            title={tr('settings.title')}
            onClick={() => changeView('settings')}
          >
            <Settings2 size={21} />
            <span>{tr('navigation.settings')}</span>
          </button>
            <span className="version">v{appVersion}</span>
        </div>
      </nav>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="wordmark">
            {tr('app.name')}
            <span>.</span>
          </span>
          <span className="brand-caption">{tr('app.tagline')}</span>
        </div>
        <div className="section-heading">
            <span>{tr('clubs.sidebarHeading')}</span>
            <Count>{data.clubs.length}</Count>
        </div>
          <button className="button new-club" onClick={() => setEditor({kind: 'club'})}>
          <Plus size={17} />
              {tr('clubs.new')}
        </button>
          <div className="club-list">
              {data.clubs.map((c) => (
            <button
                className={`club-list-item ${c.id === club?.id && view === 'clubs' ? 'active' : ''}`}
              key={c.id}
              onClick={() => {
                  commit((data) => ({...data, activeClubId: c.id}));
                  changeView('clubs');
              }}
            >
                <ClubIcon size={17}/>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.characterIds.length}
                  {tr('counts.charactersSeparator')}
                  {c.connections.length}
                  {tr('counts.connectionsSuffix')}
                </small>
              </span>
                {c.id === club?.id && view === 'clubs' && <ChevronRight size={15}/>}
            </button>
          ))}
              {!data.clubs.length && <p className="sidebar-hint">{tr('clubs.sidebarHint')}</p>}
        </div>
        <div className="sidebar-relations">
          <div className="section-heading">
            <span>{tr('relationships.heading')}</span>
            <button
              className="icon-button"
              aria-label={tr('relationships.create')}
              onClick={newType}
            >
              <Plus size={16} />
            </button>
          </div>
          {relationTypes.map((type) => (
            <div
              className={`legend-row ${hiddenTypes.has(type.id) ? 'is-hidden' : ''}`}
              key={type.id}
            >
              <button
                className="legend-name"
                title={tr('relationships.editAction')}
                onClick={() => setEditor({ kind: 'type', id: type.id })}
              >
                <i style={{ background: type.color }} />
                <span>{type.name}</span>
              </button>
              <button
                className="icon-button"
                aria-label={tr(
                  'relationships.toggleVisibilityLabel',
                  hiddenTypes.has(type.id) ? tr('actions.show') : tr('actions.hide'),
                  type.name,
                )}
                onClick={() =>
                  setHiddenTypes((previous) => {
                    const next = new Set(previous);
                    if (next.has(type.id)) next.delete(type.id);
                    else next.add(type.id);
                    return next;
                  })
                }
              >
                {hiddenTypes.has(type.id) ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          ))}
          {!data.relationTypes.length && (
            <p className="sidebar-hint">{tr('relationships.sidebarHint')}</p>
          )}
          <button className="text-button sidebar-link" onClick={() => changeView('relations')}>
            {tr('relationships.all')}
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="local-badge">
          <span className="status-dot" />
          <div>
            <strong>{tr('app.localOnly')}</strong>
            <small>{window.desktop ? tr('app.offline') : tr('app.browserStorage')}</small>
          </div>
          <HardDrive size={17} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-heading">
            <div className="breadcrumb">
              {tr('navigation.workspaceHeading')}
              <span>/</span>
                {view === 'clubs'
                    ? tr('navigation.clubsHeading')
                : view === 'characters'
                  ? tr('navigation.charactersHeading')
                  : view === 'relations'
                    ? tr('relationships.heading')
                    : tr('navigation.settingsHeading')}
            </div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="header-actions">
              {view === 'clubs' && club && (
              <>
                <div className="dropdown-wrap">
                  <button
                      className="icon-button more-club"
                      aria-label={tr('clubs.actionsLabel')}
                      onClick={() => setClubMenu(!clubMenu)}
                  >
                    <MoreHorizontal size={22} />
                  </button>
                    {clubMenu && (
                    <div className="dropdown">
                      <button
                        onClick={() => {
                            setEditor({kind: 'club', id: club.id});
                            setClubMenu(false);
                        }}
                      >
                        <Pencil size={15} />
                          {tr('clubs.edit')}
                      </button>
                      <button
                        onClick={() => {
                          const copy = {
                              ...club,
                            id: crypto.randomUUID(),
                              name: tr('clubs.copyName', club.name.slice(0, 70)),
                              characterIds: [...club.characterIds],
                              connections: club.connections.map((e) => ({
                              ...e,
                              id: crypto.randomUUID(),
                            })),
                          };
                            saveClub(copy);
                            setClubMenu(false);
                        }}
                      >
                        <Copy size={15} />
                        {tr('actions.duplicate')}
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => {
                          setConfirmation({
                              title: tr('clubs.deleteTitle'),
                              text: tr('clubs.deleteMessage', club.name),
                            action: () => {
                              commit((data) => {
                                  const clubs = data.clubs.filter((c) => c.id !== club.id);
                                  return {...data, clubs, activeClubId: clubs[0]?.id || null};
                              });
                              clearSelection();
                            },
                          });
                            setClubMenu(false);
                        }}
                      >
                        <Trash2 size={15} />
                          {tr('clubs.delete')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="dropdown-wrap">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setExportMenu(!exportMenu)}
                  >
                    <Download size={16} />
                    {tr('actions.export')}
                    <ChevronDown size={13} />
                  </button>
                  {exportMenu && (
                    <div className="dropdown export-dropdown">
                      <button
                        onClick={() =>
                          void exportJSON(
                              createStoriesTransfer(data, [club.id]),
                              tr('filenames.story', club.name),
                          )
                        }
                      >
                        <BookOpen size={15} />
                        <span>
                          {tr('transfer.story')}
                          <small>{tr('transfer.storyHint')}</small>
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          void exportJSON(createStoriesTransfer(data), tr('filenames.allStories'))
                        }
                      >
                        <Copy size={15} />
                        <span>
                          {tr('transfer.allStories')}
                          <small>{tr('transfer.allStoriesHint')}</small>
                        </span>
                      </button>
                      <button onClick={() => void importJSON()}>
                        <Upload size={15} />
                        <span>
                          {tr('transfer.import')}
                          <small>{tr('transfer.importHint')}</small>
                        </span>
                      </button>
                      <button onClick={() => void makeExport('png')}>
                        <Download size={15} />
                        <span>
                          {tr('export.png')}
                          <small>{tr('export.pngHint')}</small>
                        </span>
                      </button>
                      <button onClick={() => void makeExport('svg')}>
                        <Download size={15} />
                        <span>
                          {tr('export.svg')}
                          <small>{tr('export.svgHint')}</small>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                <button className="button primary" onClick={newConnection}>
                  <Plus size={17} />
                  {tr('connections.add')}
                </button>
              </>
            )}
            {view === 'characters' && (
              <>
                <div className="dropdown-wrap">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setExportMenu(!exportMenu)}
                  >
                    <Download size={16} />
                    {tr('transfer.export')}
                    <ChevronDown size={13} />
                  </button>
                  {exportMenu && (
                    <div className="dropdown export-dropdown">
                      <button
                        onClick={() =>
                          void exportJSON(
                            createCharactersTransfer(data),
                            tr('filenames.allCharacters'),
                          )
                        }
                      >
                        <Users size={15} />
                        <span>
                          {tr('transfer.allCharacters')}
                          <small>{tr('transfer.charactersHint')}</small>
                        </span>
                      </button>
                      <button
                        disabled={!activeFolder}
                        onClick={() =>
                          void exportJSON(
                            createCharactersTransfer(data, {
                              folderId: activeFolder === ':unfiled' ? null : activeFolder,
                            }),
                            tr(
                              'filenames.characters',
                              data.folders.find((folder) => folder.id === activeFolder)?.name ||
                                tr('folders.unfiled'),
                            ),
                          )
                        }
                      >
                        <FolderOpen size={15} />
                        <span>
                          {tr('transfer.currentFolder')}
                          <small>
                            {activeFolder
                              ? tr('transfer.folderHint')
                              : tr('transfer.selectFolderHint')}
                          </small>
                        </span>
                      </button>
                      <button onClick={() => void importJSON()}>
                        <Upload size={15} />
                        <span>
                          {tr('transfer.import')}
                          <small>{tr('transfer.addToLibrary')}</small>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                <button className="button secondary" onClick={newFolder}>
                  <FolderPlus size={17} />
                  {tr('folders.new')}
                </button>
                <button className="button primary" onClick={newCharacter}>
                  <Plus size={17} />
                  {tr('characters.new')}
                </button>
              </>
            )}
            {view === 'relations' && (
              <>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void exportJSON(createRelationsTransfer(data), tr('filenames.relationships'))
                  }
                >
                  <Download size={16} />
                  {tr('transfer.export')}
                </button>
                <button className="button primary" onClick={newType}>
                  <Plus size={17} />
                  {tr('relationships.new')}
                </button>
              </>
            )}
          </div>
        </header>

        {(library.error || library.warning) && (
          <div className="save-alert" role="alert">
            <span>{library.error || library.warning}</span>
            {library.error && (
              <button className="text-button" onClick={library.retry}>
                {tr('actions.retrySave')}
              </button>
            )}
          </div>
        )}

          {view === 'clubs' && (
          <div className="editor-layout">
            <section
              className={`canvas ${linking ? 'linking' : ''}`}
              aria-label={tr('diagram.editorLabel')}
            >
                {club && club.characterIds.length > 0 ? (
                <>
                  <div className="canvas-top">
                    <div className="canvas-meta">
                      <span className="status-dot" />
                      {tr('diagram.heading')}
                      <span className="meta-divider">/</span>
                        {club.characterIds.length}
                      {tr('counts.membersSuffix')}
                    </div>
                    <button
                      className={`button canvas-tool ${linking ? 'active' : ''}`}
                      onClick={() => {
                        setLinking(!linking);
                        clearSelection();
                      }}
                      title={tr('diagram.connectHint')}
                    >
                      <Link2 size={15} />
                      {tr('diagram.connect')}
                    </button>
                  </div>
                  <div
                    className="diagram-viewport"
                    ref={attachDiagramWheel}
                    onPointerDown={(e) => {
                      if (
                        e.button !== 0 ||
                        (e.target as Element).closest('.diagram-node, .diagram-edge')
                      )
                        return;
                      e.preventDefault();
                      const origin = { x: e.clientX, y: e.clientY },
                        previous = pan;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const viewport = e.currentTarget;
                      const move = (event: PointerEvent) =>
                        setPan({
                          x: previous.x + event.clientX - origin.x,
                          y: previous.y + event.clientY - origin.y,
                        });
                      const up = () => {
                        viewport.removeEventListener('pointermove', move);
                        viewport.removeEventListener('pointerup', up);
                        viewport.removeEventListener('pointercancel', up);
                      };
                      viewport.addEventListener('pointermove', move);
                      viewport.addEventListener('pointerup', up);
                      viewport.addEventListener('pointercancel', up);
                    }}
                  >
                    <div
                      className="diagram-transform"
                      style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
                    >
                      <Diagram
                          club={club}
                        characters={data.characters}
                        types={data.relationTypes}
                        selectedCharacter={selectedCharacter}
                        selectedEdge={selectedEdge}
                        hiddenTypes={hiddenTypes}
                        showLabels={labels}
                        onCharacter={pickCharacter}
                        onEdge={(id) => {
                          setSelectedEdge(id);
                          setSelectedCharacter(undefined);
                        }}
                        onBackground={() => {
                          if (!linking) clearSelection();
                        }}
                      />
                    </div>
                  </div>
                  <div className="canvas-bottom">
                    <p>
                      {linking
                        ? selectedCharacter
                          ? tr('diagram.selectSecond')
                          : tr('diagram.selectFirst')
                        : tr('diagram.selectionHint')}
                    </p>
                    <div className="zoom-controls">
                      <button
                        className="icon-button"
                        aria-label={tr('diagram.zoomOut')}
                        onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}
                        disabled={zoom <= 0.5}
                      >
                        <ZoomOut size={17} />
                      </button>
                      <span>{Math.round(zoom * 100)}%</span>
                      <button
                        className="icon-button"
                        aria-label={tr('diagram.zoomIn')}
                        onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(1)))}
                        disabled={zoom >= 2.5}
                      >
                        <ZoomIn size={17} />
                      </button>
                      <i />
                      <button
                        className="icon-button"
                        aria-label={tr('diagram.center')}
                        onClick={() => {
                          setZoom(1);
                          setPan({ x: 0, y: 0 });
                        }}
                      >
                        <Maximize size={16} />
                      </button>
                    </div>
                    <button
                      className={`label-toggle ${labels ? 'active' : ''}`}
                      onClick={() => setLabels(!labels)}
                    >
                      <Tag size={15} />
                      {tr('diagram.labels')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="canvas-empty">
                  <div className="empty-orbit">
                    <OrbitMark size={120} />
                  </div>
                    <span className="eyebrow">{tr('clubs.emptyEyebrow')}</span>
                    <h2>{club ? tr('clubs.noMembersHeading') : tr('clubs.emptyHeading')}</h2>
                    <p>{club ? tr('clubs.noMembersDescription') : tr('clubs.emptyDescription')}</p>
                  <button
                    className="button primary"
                    onClick={() => setEditor({kind: club ? 'participants' : 'club'})}
                  >
                    <Plus size={17} />
                      {club ? tr('characters.add') : tr('clubs.createFirst')}
                  </button>
                    {!club && !data.characters.length && (
                    <button
                      className="text-button demo-button"
                      onClick={() => {
                        commit(() => demoDatabase());
                        notify(tr('notifications.exampleAdded'));
                      }}
                    >
                      <Sparkles size={15} />
                      {tr('demo.explore')}
                    </button>
                  )}
                  <div className="onboarding-steps">
                    <span>
                      <b>01</b>
                      {tr('navigation.characters')}
                    </span>
                    <i />
                    <span>
                      <b>02</b>
                      {tr('navigation.relationships')}
                    </span>
                    <i />
                    <span>
                      <b>03</b>
                        {tr('clubs.defaultName')}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <aside className="inspector">
                {character && club ? (
                <>
                  <div className="inspector-title">
                    <span>{tr('characters.detailHeading')}</span>
                    <button
                      className="icon-button"
                      aria-label={tr('actions.clearSelection')}
                      onClick={clearSelection}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="character-detail">
                    <Avatar character={character} size={76} />
                    <h2>{character.name}</h2>
                    <span className="pill">{tr('characters.inLibrary')}</span>
                    <p className="detail-notes">{character.notes || tr('characters.emptyNotes')}</p>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        onClick={() => setEditor({ kind: 'character', id: character.id })}
                      >
                        <Pencil size={14} />
                        {tr('actions.edit')}
                      </button>
                      <button className="button primary" onClick={newConnection}>
                        <Link2 size={14} />
                        {tr('actions.connect')}
                      </button>
                    </div>
                  </div>
                  <div className="section-heading">
                    <span>{tr('characters.connectionsHeading')}</span>
                    <Count>
                      {
                          club.connections.filter(
                          (e) => e.sourceId === character.id || e.targetId === character.id,
                        ).length
                      }
                    </Count>
                  </div>
                  <div className="inspector-list">
                    {connections
                      .filter((e) => e.sourceId === character.id || e.targetId === character.id)
                      .map((e) => (
                        <ConnectionRow
                          key={e.id}
                          edgeId={e.id}
                          club={club}
                          data={data}
                          onClick={() => {
                            setSelectedEdge(e.id);
                            setSelectedCharacter(undefined);
                          }}
                        />
                      ))}
                  </div>
                  <div className="inspector-footer">
                    <button
                      className="text-button danger-text"
                      onClick={() => {
                        setConfirmation({
                          title: tr('members.removeTitle'),
                          text: tr('members.removeMessage', character.name),
                          action: () => {
                              updateClub((c) => removeFromClub(c, character.id));
                            clearSelection();
                          },
                        });
                      }}
                    >
                      <X size={14} />
                      {tr('members.remove')}
                    </button>
                  </div>
                </>
                ) : edge && club ? (
                <>
                  <div className="inspector-title">
                    <span>{tr('connections.detailHeading')}</span>
                    <button
                      className="icon-button"
                      aria-label={tr('actions.clearSelection')}
                      onClick={clearSelection}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="edge-detail">
                    <div
                      className="relation-chip"
                      style={{ color: data.relationTypes.find((t) => t.id === edge.typeId)?.color }}
                    >
                      <i style={{ background: 'currentColor' }} />
                      {data.relationTypes.find((t) => t.id === edge.typeId)?.name}
                    </div>
                    <h2>
                      {data.characters.find((c) => c.id === edge.sourceId)?.name}
                      <span>{edge.directed ? '↓' : '↕'}</span>
                      {data.characters.find((c) => c.id === edge.targetId)?.name}
                    </h2>
                    <span className="pill">
                      {edge.directed ? tr('connections.directed') : tr('connections.mutual')}
                    </span>
                    <p className="detail-notes">{edge.notes || tr('connections.emptyNotes')}</p>
                    <button
                      className="button secondary full-width"
                      onClick={() => setEditor({ kind: 'connection', id: edge.id })}
                    >
                      <Pencil size={15} />
                      {tr('connections.edit')}
                    </button>
                  </div>
                  <div className="inspector-footer">
                    <button
                      className="text-button danger-text"
                      onClick={() =>
                        setConfirmation({
                          title: tr('connections.deleteTitle'),
                          text: tr('connections.deleteMessage'),
                          action: () => {
                              updateClub((c) => ({
                              ...c,
                              connections: c.connections.filter((e) => e.id !== edge.id),
                            }));
                            clearSelection();
                          },
                        })
                      }
                    >
                      <Trash2 size={14} />
                      {tr('connections.delete')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="inspector-tabs">
                    <button
                      className={inspectorTab === 'members' ? 'active' : ''}
                      onClick={() => setInspectorTab('members')}
                    >
                      {tr('inspector.members')}
                        <Count>{club?.characterIds.length || 0}</Count>
                    </button>
                    <button
                      className={inspectorTab === 'connections' ? 'active' : ''}
                      onClick={() => setInspectorTab('connections')}
                    >
                      {tr('inspector.connections')}
                        <Count>{club?.connections.length || 0}</Count>
                    </button>
                  </div>
                  <ScrollArea
                    className="inspector-content"
                    key={`${club?.id}:${inspectorTab}`}
                    scrollKey={`${club?.id}:${inspectorTab}`}
                    positions={inspectorPositions.current}
                  >
                    {inspectorTab === 'members' ? (
                      <>
                        <div className="inspector-caption">
                          <span>{tr('members.heading')}</span>
                          <button
                            className="icon-button"
                            disabled={!club}
                            aria-label={tr('members.add')}
                            onClick={() => setEditor({ kind: 'participants' })}
                          >
                            <Plus size={17} />
                          </button>
                        </div>
                        <div className="inspector-list">
                            {club &&
                            members.map((c) => {
                              const id = c.id;
                                const index = club.characterIds.indexOf(id);
                              return (
                                <div className="member-row" key={id}>
                                  <button className="member-main" onClick={() => pickCharacter(id)}>
                                    <Avatar character={c} />
                                    <span>
                                      <strong>{c.name}</strong>
                                      <small>
                                        {
                                            club.connections.filter(
                                            (e) => e.sourceId === id || e.targetId === id,
                                          ).length
                                        }{' '}
                                        {tr('counts.connections')}
                                      </small>
                                    </span>
                                  </button>
                                  <div className="reorder-buttons">
                                    <button
                                      className="icon-button"
                                      aria-label={tr('members.moveUpLabel', c.name)}
                                      title={tr('members.moveBackwardHint')}
                                      disabled={index === 0}
                                      onClick={() => reorder(id, -1)}
                                    >
                                      <ArrowUp size={12} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      aria-label={tr('members.moveDownLabel', c.name)}
                                      title={tr('members.moveForwardHint')}
                                      disabled={index === club.characterIds.length - 1}
                                      onClick={() => reorder(id, 1)}
                                    >
                                      <ArrowDown size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                          {club && (
                          <button
                            className="button dashed full-width"
                            onClick={() => setEditor({ kind: 'participants' })}
                          >
                            <Plus size={16} />
                            {tr('members.fromLibrary')}
                          </button>
                        )}
                          {!club?.characterIds.length && (
                          <EmptyHint>{tr('members.emptyHint')}</EmptyHint>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="inspector-caption">
                          <span>{tr('connections.inspectorHeading')}</span>
                          <button
                            className="icon-button"
                            aria-label={tr('connections.create')}
                            disabled={!club}
                            onClick={newConnection}
                          >
                            <Plus size={17} />
                          </button>
                        </div>
                        <div className="inspector-list">
                            {club &&
                            connections.map((e) => (
                              <ConnectionRow
                                key={e.id}
                                edgeId={e.id}
                                club={club}
                                data={data}
                                onClick={() => {
                                  setSelectedEdge(e.id);
                                  setSelectedCharacter(undefined);
                                }}
                              />
                            ))}
                        </div>
                          {!club?.connections.length && (
                          <EmptyHint>{tr('connections.createHint')}</EmptyHint>
                        )}
                      </>
                    )}
                  </ScrollArea>
                  <div className="inspector-tip">
                    <BookOpen size={19} />
                    <p>
                      {tr('members.sharedTitle')}
                      <span>{tr('members.sharedHint')}</span>
                    </p>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        {view === 'characters' && (
          <CharacterLibrary
            data={data}
            search={search}
            onSearch={setSearch}
            activeFolder={activeFolder}
            onSelectFolder={setActiveFolder}
            onNewFolder={newFolder}
            onNewSubfolder={(folder) => setEditor({ kind: 'folder', parentId: folder.id })}
            onEditFolder={(folder) => setEditor({ kind: 'folder', id: folder.id })}
            onDeleteFolder={askDeleteFolder}
            onNewCharacter={newCharacter}
            onEditCharacter={(character) => setEditor({ kind: 'character', id: character.id })}
            onDeleteCharacter={askDeleteCharacter}
            onExportCharacter={(character) =>
              void exportJSON(
                createCharactersTransfer(data, { characterIds: [character.id] }),
                tr('filenames.character', character.name),
              )
            }
            exporting={busy}
          />
        )}

        {view === 'relations' && (
          <section className="library-page">
            <div className="page-toolbar">
              <p className="muted">{tr('relationships.sharedHint')}</p>
              <span className="muted">
                {data.relationTypes.length}
                {tr('counts.relationshipTypesSuffix')}
              </span>
            </div>
            <div className="relations-grid">
              {relationTypes.map((type) => (
                <article className="type-card" key={type.id}>
                  <div className="type-illustration" style={{ color: type.color }}>
                    <span />
                    <i />
                    <span />
                  </div>
                  <div>
                    <h2>{type.name}</h2>
                    <p>
                        {data.clubs.reduce(
                        (sum, c) => sum + c.connections.filter((e) => e.typeId === type.id).length,
                        0,
                      )}{' '}
                      {tr('counts.connectionsSeparator')}
                      {type.color.toUpperCase()}
                    </p>
                  </div>
                  <div className="type-actions">
                    <button
                      className="icon-button"
                      aria-label={tr('relationships.editLabel', type.name)}
                      onClick={() => setEditor({ kind: 'type', id: type.id })}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={tr('relationships.deleteLabel', type.name)}
                      onClick={() => askDeleteType(type)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!data.relationTypes.length && (
              <PageEmpty
                icon={<Link2 size={38} />}
                title={tr('relationships.emptyHeading')}
                text={tr('relationships.emptyDescription')}
                action={tr('relationships.create')}
                onClick={newType}
              />
            )}
            <div className="page-callout">
              <Tag size={21} />
              <div>
                <strong>{tr('relationships.multipleTitle')}</strong>
                <p>{tr('relationships.multipleHint')}</p>
              </div>
            </div>
          </section>
        )}

        {view === 'settings' && (
          <section className="settings-page">
            <div className="settings-card compact">
              <h2>{tr('settings.language')}</h2>
              <label className="field">
                <select
                  aria-label={tr('settings.language')}
                  value={locale}
                  disabled={busy}
                  onChange={async (event) => {
                    const next = event.target.value;
                    if (!isLocale(next)) return;
                    setBusy(true);
                    try {
                      await library.flush();
                      await storage.setLanguage(next);
                      setLocale(next);
                      setToast('');
                      await library.load();
                    } catch (error) {
                      notify(String(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <option value="ru">{tr('language.russian')}</option>
                  <option value="en">{tr('language.english')}</option>
                </select>
              </label>
              <p className="field-hint">{tr('settings.languageHint')}</p>
            </div>
            <div className="settings-card">
              <div className="settings-card-heading">
                <ShieldCheck size={25} />
                <div>
                  <h2>{tr('settings.ownershipTitle')}</h2>
                  <p>{tr('settings.ownershipHint')}</p>
                </div>
              </div>
              <div className="stats-row">
                <div>
                  <strong>{data.characters.length}</strong>
                  <span>{tr('counts.characters')}</span>
                </div>
                <div>
                    <strong>{data.clubs.length}</strong>
                    <span>{tr('counts.clubs')}</span>
                </div>
                <div>
                  <strong>{data.relationTypes.length}</strong>
                  <span>{tr('counts.relationships')}</span>
                </div>
              </div>
              <div className="data-path">
                <HardDrive size={16} />
                <code>{library.path}</code>
              </div>
              {window.desktop && (
                <button
                  className="button secondary"
                  onClick={() => void storage.showDataFolder().catch((e) => notify(String(e)))}
                >
                  <FolderOpen size={16} />
                  {tr('data.openFolder')}
                </button>
              )}
            </div>
            <div className="settings-card">
              <h2>{tr('transfer.title')}</h2>
              <p>{tr('transfer.description')}</p>
              <div className="transfer-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void exportJSON(createStoriesTransfer(data), tr('filenames.allStories'))
                  }
                >
                  <BookOpen size={16} />
                  {tr('transfer.allStories')}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void exportJSON(createCharactersTransfer(data), tr('filenames.allCharacters'))
                  }
                >
                  <Users size={16} />
                  {tr('transfer.allCharacters')}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void exportJSON(createRelationsTransfer(data), tr('filenames.relationships'))
                  }
                >
                  <Link2 size={16} />
                  {tr('transfer.relationshipTypes')}
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void importJSON()}
                >
                  <Upload size={16} />
                  {tr('transfer.import')}
                </button>
              </div>
              <p className="field-hint">{tr('transfer.mergeHint')}</p>
            </div>
            <div className="settings-card">
              <h2>{tr('backup.title')}</h2>
              <p>{tr('backup.description')}</p>
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await library.flush();
                      if (await storage.exportBackup(data)) notify(tr('notifications.backupSaved'));
                    } catch (error) {
                      notify(String(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Download size={16} />
                  {tr('backup.save')}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void importBackup()}
                >
                  <Upload size={16} />
                  {tr('actions.import')}
                </button>
              </div>
              <p className="field-hint">{tr('backup.replaceHint')}</p>
            </div>
            <div className="settings-card compact">
              <h2>{tr('help.title')}</h2>
              <div className="help-steps">
                <p>
                  <b>1</b>
                  <span>{tr('help.relationshipStep')}</span>
                </p>
                <p>
                  <b>2</b>
                  <span>{tr('help.characterStep')}</span>
                </p>
                <p>
                  <b>3</b>
                    <span>{tr('help.clubStep')}</span>
                </p>
              </div>
              <p className="field-hint">{tr('help.shortcuts')}</p>
            </div>
          </section>
        )}

        <footer className="statusbar">
          <span className={`save-status ${library.status === 'error' ? 'error' : ''}`}>
            {library.status === 'saving' ? (
                <LoadingIcon size={12} className="spin"/>
            ) : (
              <Check size={12} />
            )}
            {library.status === 'saving'
              ? tr('save.saving')
              : library.status === 'error'
                ? tr('save.error')
                : tr('save.saved')}
          </span>
          <span>
            {view === 'clubs' && club
                ? tr('counts.diagramSummary', club.connections.length, club.characterIds.length)
              : tr('app.footer')}
          </span>
        </footer>
      </main>

      {editor && (
        <Modal
          title={
            editor.kind === 'character'
              ? editor.id
                ? tr('characters.edit')
                : tr('characters.new')
              : editor.kind === 'folder'
                ? editor.id
                  ? tr('folders.edit')
                  : tr('folders.new')
                : editor.kind === 'type'
                  ? editor.id
                    ? tr('relationships.edit')
                    : tr('relationships.new')
                        : editor.kind === 'club'
                    ? editor.id
                                ? tr('clubs.edit')
                                : tr('clubs.new')
                    : editor.kind === 'participants'
                      ? tr('members.title')
                      : editor.id
                        ? tr('connections.edit')
                        : tr('connections.new')
          }
          subtitle={
            editor.kind === 'character'
              ? tr('characters.formHint')
              : editor.kind === 'type'
                ? tr('relationships.formHint')
                : undefined
          }
          onClose={closeEditor}
          wide={editor.kind === 'connection'}
        >
          {editor.kind === 'character' && (
            <CharacterForm
              character={data.characters.find((c) => c.id === editor.id)}
              onSave={saveCharacter}
              onClose={closeEditor}
              canAddToClub={view === 'clubs' && !!club}
              folders={data.folders}
              initialFolderId={
                view === 'characters' && activeFolder && activeFolder !== ':unfiled'
                  ? activeFolder
                  : null
              }
            />
          )}
          {editor.kind === 'folder' && (
            <FolderForm
              folder={data.folders.find((folder) => folder.id === editor.id)}
              folders={data.folders}
              initialParentId={editor.parentId}
              onSave={saveFolder}
              onClose={closeEditor}
            />
          )}
          {editor.kind === 'type' && (
            <TypeForm
              type={data.relationTypes.find((t) => t.id === editor.id)}
              types={data.relationTypes}
              onSave={saveType}
              onClose={closeEditor}
            />
          )}
            {editor.kind === 'club' && (
                <ClubForm
                    club={data.clubs.find((c) => c.id === editor.id)}
                    onSave={saveClub}
              onClose={closeEditor}
            />
          )}
            {editor.kind === 'connection' && club && (
            <ConnectionForm
                connection={club.connections.find((e) => e.id === editor.id)}
                club={club}
              data={data}
              sourceId={editor.sourceId}
              targetId={editor.targetId}
              onClose={closeEditor}
              onNewType={newType}
              onSave={(edge) => {
                  updateClub((c) => ({
                  ...c,
                  connections: c.connections.some((e) => e.id === edge.id)
                    ? c.connections.map((e) => (e.id === edge.id ? edge : e))
                    : [...c.connections, edge],
                }));
                closeEditor();
                setSelectedEdge(edge.id);
                setSelectedCharacter(undefined);
                notify(tr('notifications.connectionSaved'));
              }}
            />
          )}
            {editor.kind === 'participants' && club && (
            <ParticipantsForm
                club={club}
              characters={data.characters}
              folders={data.folders}
              onClose={closeEditor}
              onNewCharacter={newCharacter}
              onSave={(ids) => {
                const members = new Set(ids);
                  updateClub((c) => ({
                  ...c,
                  characterIds: ids,
                  connections: c.connections.filter(
                    (e) => members.has(e.sourceId) && members.has(e.targetId),
                  ),
                }));
                closeEditor();
                clearSelection();
              }}
            />
          )}
        </Modal>
      )}

      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <p className="confirm-text">{confirmation.text}</p>
          <div className="modal-footer">
            <button className="button secondary" onClick={() => setConfirmation(null)}>
              {tr('actions.cancel')}
            </button>
            <button
              className="button danger"
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              {tr('actions.delete')}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label={tr('notifications.dismissLabel')}
            onClick={() => setToast('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ConnectionRow({
  edgeId,
                           club,
  data,
  onClick,
}: {
  edgeId: string;
    club: Club;
  data: Database;
  onClick: () => void;
}) {
    const edge = club.connections.find((e) => e.id === edgeId)!;
  const type = data.relationTypes.find((t) => t.id === edge.typeId)!;
  return (
    <button className="connection-row" onClick={onClick}>
      <i style={{ background: type.color }} />
      <span>
        <strong>{type.name}</strong>
        <small>
          {data.characters.find((c) => c.id === edge.sourceId)?.name}
          {edge.directed ? ' → ' : ' ↔ '}
          {data.characters.find((c) => c.id === edge.targetId)?.name}
        </small>
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

function PageEmpty({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="page-empty">
      <div className="page-empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="button primary" onClick={onClick}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}
