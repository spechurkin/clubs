; Install Trace before the first launch. Existing theme folders belong to the user.
!macro customInstall
  IfFileExists "$INSTDIR\themes\trace\*.*" clubs_trace_installed
  IfFileExists "$INSTDIR\themes\trace" clubs_trace_installed
  SetOutPath "$INSTDIR\themes\trace"
  SetOverwrite off
  File "${BUILD_RESOURCES_DIR}\themes\trace\theme.json"
  File "${BUILD_RESOURCES_DIR}\themes\trace\style.css"
  SetOverwrite on
  SetOutPath "$INSTDIR"
  clubs_trace_installed:
!macroend

; electron-builder normally removes all of $INSTDIR, including user themes.
; Stage application files using its existing rollback helpers, skipping themes.
!macro customRemoveFiles
  SetOutPath $TEMP
  CreateDirectory "$PLUGINSDIR\old-install"
  FindFirst $R1 $R2 "$INSTDIR\*.*"
  clubs_stage_loop:
    StrCmp $R2 "" clubs_stage_done
    StrCmp $R2 "." clubs_stage_next
    StrCmp $R2 ".." clubs_stage_next
    StrCmp $R2 "themes" clubs_stage_next
    IfFileExists "$INSTDIR\$R2\*.*" clubs_stage_directory clubs_stage_file
  clubs_stage_directory:
    CreateDirectory "$PLUGINSDIR\old-install\$R2"
    Push "\$R2"
    Call un.atomicRMDir
    Pop $R0
    StrCmp $R0 "0" clubs_stage_next clubs_stage_failed
  clubs_stage_file:
    ClearErrors
    Rename "$INSTDIR\$R2" "$PLUGINSDIR\old-install\$R2"
    StrCmp $R2 "${UNINSTALL_FILENAME}" 0 +2
    ClearErrors
    IfErrors clubs_stage_failed
  clubs_stage_next:
    FindNext $R1 $R2
    Goto clubs_stage_loop
  clubs_stage_failed:
    FindClose $R1
    Push ""
    Call un.restoreFiles
    Pop $R0
    Abort "Cannot replace application files. Close Clubs and try again."
  clubs_stage_done:
    FindClose $R1
    ; Only empty application directories remain. Never recurse into themes.
    FindFirst $R1 $R2 "$INSTDIR\*.*"
  clubs_cleanup_loop:
    StrCmp $R2 "" clubs_cleanup_done
    StrCmp $R2 "." clubs_cleanup_next
    StrCmp $R2 ".." clubs_cleanup_next
    StrCmp $R2 "themes" clubs_cleanup_next
    RMDir /r "$INSTDIR\$R2"
    Delete "$INSTDIR\$R2"
  clubs_cleanup_next:
    FindNext $R1 $R2
    Goto clubs_cleanup_loop
  clubs_cleanup_done:
    FindClose $R1
    ; Non-recursive removal leaves the themes folder and its files untouched.
    RMDir "$INSTDIR"
!macroend
