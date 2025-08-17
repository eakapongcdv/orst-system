// app/editor/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function WebViewer() {
  const viewer = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();

  const [instance, setInstance] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const saveToCustomAPI = useCallback(async (saveOptions: any = {}) => {
   
    if (!instance) return;

    setIsSaving(true);
    
    alert("Coming Soon");

    try {
      const { 
        includeAnnotations = true, 
        includeChanges = true,
        customMetadata = {}
      } = saveOptions;

      // Get annotations if requested
      let xfdfString = '';
      if (includeAnnotations) {
        // xfdfString = await instance.Core.annotManager.exportAnnotations();
      }

      // Get document data
      const doc = instance.Core.documentViewer.getDocument();
      const data = await doc.getFileData({ 
        xfdfString,
        downloadType: includeChanges ? 'pdf' : 'original' 
      });

      const blob = new Blob([data], { type: 'application/pdf' });
      
      // Get document ID from search params or other source
      const documentId = searchParams.get('documentId') || 'unknown';
      
      // Prepare form data
      const formData = new FormData();
      formData.append('file', blob, 'document.pdf');
      formData.append('annotations', xfdfString);
      formData.append('includeChanges', includeChanges.toString());
      formData.append('documentId', documentId);
      
      // Add custom metadata
      Object.keys(customMetadata).forEach(key => {
        formData.append(key, customMetadata[key]);
      });

      // Send to custom API
      const response = await fetch('/api/documents/save', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
        },
        body: formData,
      });

      if (!response.ok) {
        //throw new Error(`Save failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Document saved successfully:', result);
      
      // Show success message
      alert('Document saved successfully!');
      
      return result;
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save document: ' + (error as Error).message);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [searchParams]);
  
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
      WebViewer.Iframe(
        {
          path: '/lib/webviewer',
          fullAPI: true,
          initialMode: WebViewer.Modes.SPREADSHEET_EDITOR, 
          licenseKey: process.env.NEXT_PUBLIC_PDFTRON_LICENSE_KEY || '',
          initialDoc: decodedUrl,
          //initialDoc: 'files/ตัวอย่าง อนุกรมวิธานพืชต2_(for demo) ok.docx', // ok
          //initialDoc: 'files/ตัวอย่าง อนุกรมวิธานพืชต2_(for demo) ok.pdf', // ok
          //initialDoc: 'files/ตัวอย่าง คำทับศัพท์ ok.xlsx',
          enableOfficeEditing: true,
          disabledElements: [
            // Header buttons
            // 'saveAsButton',
            'settingsButton',
          ],
        },
        viewer.current as HTMLDivElement
      ).then((instance: any) => {
        const { UI } = instance;
        UI.enableFeatures([UI.Feature.ContentEdit]);
        UI.setToolbarGroup('toolbarGroup-Edit');
        UI.openElement('thumbnailsPanel');
        setInstance(instance);

        const { documentViewer } = instance.Core;
            // Load document with incremental download disabled
            documentViewer.loadDocument(
              decodedUrl,
              {
                disableIncrementalDownload: true, // Add this option
                extension: extensionParam ?? undefined
              }
            );
      });
    });
  }, [saveToCustomAPI, searchParams]);

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
        <h1 className="text-lg font-semibold mx-4">แก้ไขเอกสาร</h1>
        
        {/* Right: Save button with icon */}
        {instance && ( 
          <button 
            onClick={() => saveToCustomAPI()}
            disabled={isSaving}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded flex items-center disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                กำลังบันทึก...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                บันทึกเอกสาร
              </>
            )}
          </button>
        )}
      </div>
      
      <div ref={viewer} className="flex-grow" style={{ height: 'calc(100vh - 60px)' }}></div>
    </div>
  );
}