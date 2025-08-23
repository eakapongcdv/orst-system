// components/toolbarStyles.ts

export const toolbarStyles = `
            /* Bottom toolbar (sticky) */
            .bottom-toolbar{
              position: sticky;
              bottom: 0;
              background: #ffffffcc;
              backdrop-filter: saturate(1.1) blur(6px);
              border-top: 1px solid #e5e7eb;
              padding: 8px 0;
              z-index: 35;
            }
            .toolbar{
              display: grid;
              grid-template-columns: auto 1fr auto; /* left: size, center: numbers, right: info+nav */
              align-items: center;
              gap: 12px;
            }
            .toolbar__section{
              display: flex;
              align-items: center;
              gap: 8px;
              min-height: 40px;
            }
            .toolbar__section--left{ justify-content: flex-start; }
            .toolbar__pager{
              justify-content: center;
              flex-wrap: wrap;
            }
            .toolbar__section--right{
              justify-content: flex-end;
              gap: 8px;
            }
            @media (max-width: 640px){
              .toolbar{
                grid-template-columns: 1fr auto; /* hide numbers on small screens */
              }
              .toolbar__pager{ display: none; }
            }
            .tsep{ color:#9ca3af; padding: 0 2px; }
            .tbtn{
              height: 36px;
              min-width: 36px;
              padding: 0 10px;
              border-radius: 10px;
              border: 1px solid #e5e7eb;
              background: #f9fafb;
              color: #374151;
              font-weight: 600;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
            }
            .tbtn:hover{ background:#f3f4f6; border-color:#d1d5db; color:#111827; }
            .tbtn:active{ transform: translateY(0.5px); }
            .tbtn[disabled]{ opacity:.45; cursor: not-allowed; }
            .tbtn-number{ min-width: 38px; padding: 0 12px; }
            .tbtn-number.is-active{
              background:#0c57d2; border-color:#0c57d2; color:#fff;
              box-shadow: 0 1px 4px rgba(12,87,210,.25);
            }
            .toolbar__info{
              font-size: .9rem;
              color:#6b7280;
              white-space: nowrap;
            }
            .select-wrap{
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 2px 8px;
              border: 1px solid #e5e7eb;
              border-radius: 10px;
              background:#fff;
            }
            .select-label{ font-size: .85rem; color:#6b7280; }
            .select--sm{
              height: 28px;
              padding: 2px 8px;
              font-size: .9rem;
              line-height: 1;
            }
            .sr-only{
              position: absolute;
              width: 1px; height: 1px;
              padding: 0; margin: -1px;
              overflow: hidden; clip: rect(0,0,0,0);
              white-space: nowrap; border: 0;
            }
            /* Layout */
            /* Make page full width on this screen */
            .fullpage { padding: 0; margin: 0; width: 100vw; }
            .a4-page { max-width: 100%; }
            /* Breadcrumbs */
            .breadcrumbs-bar {
              width: 100%;
              background: linear-gradient(180deg, #f9fafb, #f3f4f6);
              border-bottom: 1px solid #e5e7eb;
              position: sticky;
              top: 0;
              z-index: 10;
            }
            .bc-list {
              display: flex;
              align-items: center;
              gap: 8px;
              list-style: none;
              margin: 0;
              padding: 10px 0;
              font-size: .95rem;
              color: #475569;
              white-space: nowrap;           /* keep one line */
              flex-wrap: nowrap;             /* never wrap to next row */
              overflow-x: auto;              /* allow horizontal scroll when needed */
              overflow-y: hidden;
              -webkit-overflow-scrolling: touch;
            }
            .bc-list > * { flex: 0 0 auto; }
            .bc-item {
              display: inline-flex;
              align-items: center;
              gap: .5rem;
              padding: .35rem .65rem;
              border-radius: 999px;
              background: #fff;
              border: 1px solid #e5e7eb;
              color: #334155;
              font-weight: 700;
              white-space: nowrap;
            }
            .bc-item.bc-current {
              color: #111827;
              border-color: #c7d2fe;
              background: #eef2ff;
            }
            .bc-sep { color: #94a3b8; padding-inline: .25rem; flex: 0 0 auto; }


            .taxon-layout{
              display: grid;
              grid-template-columns:
                minmax(220px, 16%)              /* left index */
                minmax(0, 1fr)                  /* main column */
                clamp(240px, 22vw, 360px);      /* reserved right space */
              gap: 20px;
              align-items: start;
            }
            @media (max-width: 1280px){
              .taxon-layout{
                grid-template-columns:
                  minmax(200px, 20%)
                  1fr
                  clamp(160px, 16vw, 240px);
              }
            }
            @media (max-width: 1024px){
              .taxon-layout{ grid-template-columns: 1fr; }
              .taxon-aside--left,
              .taxon-aside--right{ display: none; }
            }
            .taxon-aside--right{
              position: sticky;
              top: 94px;
              max-height: calc(100vh - 120px);
              overflow: auto;
              background: #e5e7eb !important;
            }
            /* Reserved right column (kept blank) */
            .taxon-spacer-right{ background: transparent; min-height: 1px; }

            /* A4 responsive plate: no min-width, just cap max width & center */
            .taxon-card.taxon-card--a4{ width: min(100%, 900px); margin-inline: auto; }

            .taxon-aside {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 12px;
              padding: 14px;
              box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
              height: fit-content;
              position: sticky;
              top: 94px; /* stay visible while reading */
              max-height: calc(100vh - 120px);
              overflow: auto;
            }
            .aside-title { font-weight: 700; margin-bottom: 10px; }
            .aside-list { display: grid; gap: 6px; }
            .aside-link { width: 100%; text-align: left; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; transition: background .2s, border-color .2s; }
            .aside-link:hover { background: #f3f4f6; }
            .aside-link.is-active { background: #eef2ff; border-color: #c7d2fe; }
            .aside-link__title { font-weight: 600; line-height: 1.2; color: #111827; }
            .aside-link__sci { font-size: .85rem; color: #6b7280; margin-top: 2px; }

            .summary-card { background: #fff; border: 1px solid var(--border, #e5e7eb); border-radius: 12px; padding: 12px; }
            .summary-dl { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 8px; }
            .summary-dl dt { color: #6b7280; }
            .summary-dl dd { color: #111827; }

            /* Card & header (main) */
            .taxon-card {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 14px;
              padding: 30px;
              box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            }
            .taxon-header {
              display: grid;
              grid-template-columns: 1fr auto; /* headline + actions */
              gap: 16px;
              align-items: baseline;
              margin-bottom: 8px;
            }
            .taxon-headline { display: flex; align-items: baseline; gap: clamp(12px, 1.5vw, 18px); flex-wrap: wrap; }
            .taxon-sci { font-size: clamp(1.5rem, 1.5vw, 1.5rem); line-height: 1.2; color: #6b2a34; opacity: .9; }
            .taxon-actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
            .btn-info {
              display: inline-flex; align-items: center; gap: 8px;
              background: #0c57d2; color: #fff; padding: 8px 12px; border-radius: 10px; border: 0; cursor: pointer;
            }
            .btn-info:hover { background: #0a4dbb; }
            .btn-info__label { font-weight: 600; }
            .taxon-title {
              font-size: clamp(2.5rem, 2.5vw, 2.5rem);
              line-height: 1.15;
              font-weight: 800;
              color: #50151d;
              margin: 0;
            }
            
            .taxon-sci em { font-style: italic; }
            .taxon-updated { font-size: 0.85rem; color: #6b7280; text-align: right; }
            .taxon-updated--bottom { padding-top: .5rem; margin-top: .5rem; border-top: 1px dashed var(--border, #e5e7eb); }
            .taxon-metaheader {
              display: grid;
              grid-template-columns: 4rem 1fr;
              column-gap: 14px;
              row-gap: 6px;
              margin: 12px 0 12px;
            }
            .taxon-metaheader .row { display: contents; }
            .taxon-metaheader dt { color: #111827; font-weight: 900; }
            .taxon-metaheader dd { margin: 0; color: #111827; }

            .taxon-shortdescription {
              margin: 1rem 0 1rem;
              font-size: 1rem;
              line-height: 1.5rem;
              color: #111827;
              background: #c1a58c;
              padding: 0.5rem 1rem 0.5rem 1rem;
              border-radius: 15px;
            }
            .taxon-shortdescription p { margin: 0; }

            /* Article: two-column layout on wide screens */
            .taxon-article { text-align: justify; }
            @media (min-width: 1024px) { .taxon-article { column-count: 2; column-gap: 36px; } }

            .taxon-article p > strong { color: #111827; }
            .taxon-article p { line-height: 1.85; }
            .taxon-article em { font-style: italic; }

            /* Searchbar */
            .searchbar-wrap { width: 100%; max-width: 1100px; margin: 0 auto 1rem; }
            @media (max-width: 1024px) { .searchbar-wrap { max-width: 720px; } }

            .searchbar {
            display: grid;
            grid-template-columns: 24px 1fr auto auto;
            align-items: center;
            background: #fff;
            border: 1px solid var(--border, #e5e7eb);
            border-radius: 9999px;
            padding: 2px 10px;
            box-shadow: 0 2px 8px rgba(15,23,42,.06);
            transition: box-shadow .2s ease;
            }
            .searchbar:focus-within { box-shadow: 0 4px 16px rgba(15,23,42,.08); }

            .searchbar__icon { width: 20px; height: 20px; color: #6b7280; }
            .searchbar__input {
            width: 100%;
            border: none;
            outline: none;
            font-size: 1rem;
            padding: 8px 0;
            background: transparent;
            }
            .searchbar__clear {
            border: 0;
            background: transparent;
            padding: 6px;
            border-radius: 9999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #6b7280;
            }
            .searchbar__clear:hover { background: #f3f4f6; color: #111827; }

            .searchbar__submit {
            border: 0;
            background: #0c57d2;
            color: #fff;
            padding: 8px 12px;
            border-radius: 9999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            }
            .searchbar__submit svg { width: 20px; height: 20px; }

            /* Summary panel (right) */
            .summary-box.jumbotron {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 12px;
              padding: 24px;
              box-shadow: 0 2px 6px rgba(15,23,42,.04);
            }

            .summary-grid .row {
              display: grid;
              grid-template-columns: 4rem 1fr; /* narrower dt, wider dd */
              column-gap: 12px;
              row-gap: 2px;
              margin: 0 0 12px 0;
            }

            .summary-grid .row:last-child { margin-bottom: 0; }

            .summary-grid .col-sm-3 {
              color: #6b7280;
              font-weight: 600;
            }

            .summary-grid .col-sm-9 {
              color: #111827;
              word-break: break-word;
            }

            /* Slide-out panel and overlay */
            .slide-overlay {
              position: fixed;
              inset: 0;
              background: rgba(15,23,42,.25);
              backdrop-filter: blur(2px);
              opacity: 0;
              transition: opacity .25s ease;
              pointer-events: none;
              z-index: 40;
            }
            .slide-overlay.is-open { opacity: 1; pointer-events: auto; }

            .slide-panel {
              position: fixed;
              top: 0;
              right: 0;
              bottom: 0;
              width: 40vw;
              max-width: 720px;
              min-width: 320px;
              background: #fff;
              border-left: 1px solid #e5e7eb;
              box-shadow: -8px 0 24px rgba(15,23,42,.08);
              transform: translateX(100%);
              transition: transform .3s ease;
              z-index: 50;
              display: flex;
              flex-direction: column;
            }
            .slide-panel.is-open { transform: translateX(0); }
            .slide-panel__head {
              display: flex; align-items: center; justify-content: space-between;
              padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
            }
            .slide-panel__title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #111827; }
            .slide-panel__body { padding: 16px; overflow: auto; }
          `;