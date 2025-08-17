// app/editor/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function WebViewer() {
  const viewer = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [instance, setInstance] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const editPDF = useCallback(async (saveOptions: any = {}) => {
    const extension = searchParams.get('extension');
    const ossKey = searchParams.get('ossKey');
  
    if (!ossKey) {
      alert("ไม่พบข้อมูลเอกสาร");
      return;
    }
  
    // Navigate to editor page with ossKey parameter
    router.push(`/editor?extension=${extension ?? ''}&ossKey=${encodeURIComponent(ossKey)}`);
  }, [searchParams, router]);

  useEffect(() => {
    console.log("web instance is ready");
  }, [instance]);

  useEffect(() => {
    const extensionParam = searchParams.get('extension');
    const ossKeyParam = searchParams.get('ossKey');
    const decodedUrl = ossKeyParam ? decodeURIComponent(ossKeyParam) : '';

    if (!decodedUrl) {
      console.error('Missing required "ossKey" query parameter; cannot load document.');
      alert('ไม่พบพารามิเตอร์เอกสาร (ossKey) กรุณากลับไปที่ตัวจัดการไฟล์แล้วลองใหม่อีกครั้ง');
      return;
    }

    import('@pdftron/webviewer').then((module) => {
      const WebViewer = module.default;
      WebViewer(
        {
          path: '/lib/webviewer',
          licenseKey: '',
          initialDoc: decodedUrl,
          enableOfficeEditing: false,
          extension: extensionParam ?? undefined,
          disabledElements: [
            // Header buttons
            // 'saveAsButton',
            'settingsButton',
          ],
        },
        viewer.current as HTMLDivElement
      ).then((instance: any) => {
        const { UI } = instance;
        UI.openElement('thumbnailsPanel');
        //instance.UI.disableElements(['toolbarGroup-View']);
        instance.UI.disableElements(['toolbarGroup-Shapes']);
        instance.UI.disableElements(['toolbarGroup-Edit']);
        instance.UI.disableElements(['toolbarGroup-Annotate']);
        instance.UI.disableElements(['toolbarGroup-Forms']);
        instance.UI.disableElements(['toolbarGroup-Insert'])
        instance.UI.disableElements(['toolbarGroup-FillAndSign']);

        setInstance(instance);

        const { documentViewer } = instance.Core;
            // Load document with incremental download disabled
            documentViewer.loadDocument(
              decodedUrl,
              {
                // disableIncrementalDownload: true,
                extension: extensionParam ?? undefined
              }
            );
      });
    });
  }, [searchParams]);

  return (
    <div className="flex flex-col h-screen">
      {/* Custom header with save button */}
      <div className="bg-gray-100 p-2 flex justify-between items-center">
        {/* Left: Back button with icon */}
        <button 
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = '/file-manager';
            }
          }}
          className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded flex items-center disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          กลับ
        </button>
        
        {/* Center: Document title */}
        <h1 className="text-lg font-semibold mx-4">อ่านเอกสาร</h1>
        
        {/* Right: Save button with icon */}
        {instance && ( 
          <button 
            onClick={() => editPDF()}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center disabled:opacity-50"
          >
            {'แก้ไขเอกสาร'}
          </button>
        )}
      </div>
      
      <div ref={viewer} className="flex-grow" style={{ height: 'calc(100vh - 60px)' }}></div>
    </div>
  );
}