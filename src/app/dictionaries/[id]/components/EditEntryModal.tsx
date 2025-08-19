// src/app/dictionaries/[id]/components/EditEntryModal.tsx
import { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Editor } from '@tinymce/tinymce-react';

// --- Redefine interfaces locally for self-containment ---
interface DictionaryEntryResult {
  id: number;
  term_th: string | null;
  term_en: string | null;
  definition_html: string | null;
  specializedDictionaryId: number;
  SpecializedDictionary: {
    title: string;
    category: string;
    subcategory: string | null;
  };
  created_at: string;
  updated_at: string;
  version: number;
}

interface DictionaryEntryVersion {
  id: number;
  version: number;
  term_th: string | null;
  term_en: string | null;
  definition_html: string | null;
  changed_at: string;
  changed_by_user_id: number | null;
}
// --- End Redefine interfaces ---

interface EditEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: DictionaryEntryResult | null;
  onUpdateSuccess: (updatedEntry: DictionaryEntryResult) => void;
}

export default function EditEntryModal({ isOpen, onClose, entry, onUpdateSuccess }: EditEntryModalProps) {
  const [editFormData, setEditFormData] = useState({
    term_th: '',
    term_en: '',
  });
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- State for Version Dropdown (inside modal header) ---
  // Ensure initial state is an empty array
  const [availableVersions, setAvailableVersions] = useState<DictionaryEntryVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  // --- End Version State ---

  // --- Handle Version Change (inside modal header) ---
  const handleVersionChange = (versionIdStr: string) => {
    const versionId = parseInt(versionIdStr, 10);
    if (isNaN(versionId) || !entry) {
        return;
    }
    setSelectedVersionId(versionId);
    // Ensure availableVersions is treated as an array, defaulting to [] if undefined/null
    const safeVersions = Array.isArray(availableVersions) ? availableVersions : [];
    const selectedVersion = safeVersions.find(v => v.id === versionId);
    if (selectedVersion) {
        setEditFormData({
            term_th: selectedVersion.term_th || '',
            term_en: selectedVersion.term_en || '',
        });
        setEditorContent(selectedVersion.definition_html || '');
    }
  };
  // --- End Handle Version Change ---

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    setSaving(true);
    setSaveError(null);
    try {
        const dataToSave = {
            ...editFormData,
            definition_html: editorContent
        };
        const response = await fetch(`/api/dictionary-entries/${entry.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                // Add authentication headers if needed
            },
            body: JSON.stringify(dataToSave),
        });
        if (!response.ok) {
            let errorMsg = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                // Ignore JSON parse error for error message
            }
            throw new Error(errorMsg);
        }
        const updatedEntry = await response.json();
        onUpdateSuccess(updatedEntry);
        onClose(); // Close modal on success
    } catch (err) {
        console.error("Save Edit error:", err);
        setSaveError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
        setSaving(false);
    }
  };

  // Reset form and fetch versions when entry changes or modal opens
  useEffect(() => {
    if (entry && isOpen) {
      setEditFormData({
        term_th: entry.term_th || '',
        term_en: entry.term_en || '',
      });
      setEditorContent(entry.definition_html || '');
      setSaveError(null);

      // --- Reset version states ---
      setAvailableVersions([]); // Reset to empty array
      setSelectedVersionId(null);
      setVersionError(null);
      setLoadingVersions(true);
      // ---

      const fetchVersions = async () => {
        try {
            const versionResponse = await fetch(`/api/dictionary-entries/${entry.id}/versions`);
            if (!versionResponse.ok) {
                let versionErrorMsg = `HTTP error! status: ${versionResponse.status}`;
                try {
                    const versionErrorData = await versionResponse.json();
                    versionErrorMsg = versionErrorData.error || versionErrorMsg;
                } catch (e) {
                    // Ignore
                }
                throw new Error(versionErrorMsg);
            }
            const versionsDataRaw = await versionResponse.json();

            // --- API now returns { current: ..., versions: ... } ---
            // Extract the versions array, ensuring it's an array
            const versionsArray = Array.isArray(versionsDataRaw?.versions) ? versionsDataRaw.versions : [];
            setAvailableVersions(versionsArray);
            // --- End API response handling ---

        } catch (err) {
            console.error("Fetch Versions error:", err);
            setVersionError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดประวัติเวอร์ชัน');
            // Ensure availableVersions is set to an empty array on error
            setAvailableVersions([]);
        } finally {
            setLoadingVersions(false);
        }
      };

      fetchVersions();
    } else {
      // Reset states when modal closes or entry is null
      // Ensure availableVersions is reset to an empty array
      setAvailableVersions([]);
      setSelectedVersionId(null);
      setVersionError(null);
      setLoadingVersions(false);
    }
  }, [entry, isOpen]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-white/30 backdrop-blur-md"
            style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
          />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <div className="w-full max-w-4xl transform overflow-hidden overflow-y-auto max-h-[90vh] rounded-2xl bg-white p-0 text-left align-middle shadow-xl transition-all">
                <Dialog.Panel className="w-full h-full flex flex-col">
                  {/* --- Updated Modal Header with Buttons and Conditional Version Selector --- */}
                  <div className="flex flex-wrap items-start justify-between gap-2 p-6 pb-4 border-b">
                    <div>
                      <Dialog.Title
                        as="h3"
                        className="text-lg font-medium leading-6 text-gray-900"
                      >
                        แก้ไขรายการคำศัพท์
                      </Dialog.Title>
                      {entry && (
                        <div className="text-sm text-gray-500 whitespace-nowrap mt-1">
                          ID: {entry.id}
                        </div>
                      )}
                    </div>

                    {/* --- Conditionally Render Version Selector and Current Version --- */}
                    {/* Only show the dropdown section if there are versions available */}
                    {Array.isArray(availableVersions) && availableVersions.length > 0 ? (
                      <div className="flex flex-col items-center space-y-1 min-w-[200px]">
                        <div className="flex items-center space-x-2 w-full">
                          <label htmlFor="version-select-header" className="text-sm text-gray-600 whitespace-nowrap">
                            เวอร์ชัน:
                          </label>
                          <div className="flex-grow">
                            {loadingVersions ? (
                              <span className="text-sm text-gray-500">กำลังโหลด...</span>
                            ) : versionError ? (
                              <span className="text-sm text-red-500">ข้อผิดพลาด: {versionError}</span>
                            ) : (
                              <select
                                id="version-select-header"
                                value={selectedVersionId ?? ''}
                                onChange={(e) => handleVersionChange(e.target.value)}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-1 border"
                                // Disable if no versions (redundant check now, but safe)
                                disabled={availableVersions.length === 0}
                              >
                                {/* Sort versions descending by version number */}
                                {/* Ensure availableVersions is treated as an array */}
                                {[...(Array.isArray(availableVersions) ? availableVersions : [])]
                                  .sort((a, b) => b.version - a.version)
                                  .map((version) => (
                                    <option key={version.id} value={version.id}>
                                      v{version.version} - {new Date(version.changed_at).toLocaleDateString('th-TH')}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </div>
                        </div>
                        {/* This message is now less likely to show, but kept for edge cases during loading/error */}
                        {(availableVersions.length === 0 && !loadingVersions && !versionError) && (
                          <span className="text-xs text-gray-500 self-end">ไม่มีประวัติเวอร์ชัน</span>
                        )}
                      </div>
                    ) : (
                      // If no versions, just show the current version number
                      entry && (
                        <div className="text-sm font-medium text-gray-700 self-end min-w-[200px] text-right">
                          เวอร์ชัน ({entry.version}) : แก้ไขล่าสุดเมื่อ {new Date(entry.updated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                        </div>
                      )
                    )}
                    {/* --- End Conditional Version Selector --- */}

                    <div className="flex space-x-3">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-md font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        onClick={handleClose}
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        form="edit-entry-form-modal"
                        className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-md font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        disabled={saving}
                      >
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                    </div>
                  </div>
                  {/* --- End Updated Modal Header --- */}

                  <form id="edit-entry-form-modal" onSubmit={handleSaveEdit} className="flex-grow overflow-y-auto p-6">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="term_en" className="block text-md font-medium text-gray-700">
                            คำศัพท์ (อังกฤษ)
                          </label>
                          <input
                            type="text"
                            name="term_en"
                            id="term_en"
                            value={editFormData.term_en}
                            onChange={handleEditFormChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                          />
                        </div>
                        <div>
                          <label htmlFor="term_th" className="block text-md font-medium text-gray-700">
                            คำศัพท์ (ไทย)
                          </label>
                          <input
                            type="text"
                            name="term_th"
                            id="term_th"
                            value={editFormData.term_th}
                            onChange={handleEditFormChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="definition_html" className="block text-md font-medium text-gray-700 mb-1">
                          คำจำกัดความ (HTML)
                        </label>
                        <Editor
                          apiKey={process.env.NEXT_PUBLIC_TINYMCE_KEY} // Ensure this is set in your environment
                          value={editorContent}
                          onEditorChange={(content) => {
                            setEditorContent(content);
                          }}
                          init={{
                            height: 400,
                            menubar: false,
                            plugins: [
                              'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                              'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                              'insertdatetime', 'media', 'table', 'help', 'wordcount'
                            ],
                            toolbar: 'undo redo | blocks | ' +
                              'bold italic forecolor | alignleft aligncenter ' +
                              'alignright alignjustify | bullist numlist outdent indent | ' +
                              'removeformat | help | image media | code fullscreen',
                            content_style: 'body { font-family:TH SarabunPSK, sans-serif; font-size:16px }',
                            font_family_formats: 'TH SarabunPSK=TH SarabunPSK; Arial=arial,helvetica,sans-serif; Times New Roman=times new roman,times;',
                            content_css: '/globals.css', // Ensure this path is correct
                          }}
                        />
                      </div>
                    </div>
                    {saveError && (
                      <div className="mt-4 p-2 bg-red-100 text-red-700 rounded text-sm">
                        <strong>ข้อผิดพลาด:</strong> {saveError}
                      </div>
                    )}
                  </form>

                  {/* --- Modal Footer (now empty, version selector is in header) --- */}
                </Dialog.Panel>
              </div>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}