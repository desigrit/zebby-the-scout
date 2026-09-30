; Remove only the catalog's model artifacts. Never recursively delete app data.
!macro deleteTrackerModels folder
  Delete "${folder}\SmolLM2-360M-Instruct-Q4_K_M.gguf"
  Delete "${folder}\SmolLM2-360M-Instruct-Q4_K_M.gguf.part"
  Delete "${folder}\SmolLM2-360M-Instruct-Q4_K_M.gguf.verified.json"
  Delete "${folder}\Qwen3-0.6B-Q8_0.gguf"
  Delete "${folder}\Qwen3-0.6B-Q8_0.gguf.part"
  Delete "${folder}\Qwen3-0.6B-Q8_0.gguf.verified.json"
  Delete "${folder}\Qwen3-4B-Q4_K_M.gguf"
  Delete "${folder}\Qwen3-4B-Q4_K_M.gguf.part"
  Delete "${folder}\Qwen3-4B-Q4_K_M.gguf.verified.json"
  Delete "${folder}\Qwen3-8B-Q4_K_M.gguf"
  Delete "${folder}\Qwen3-8B-Q4_K_M.gguf.part"
  Delete "${folder}\Qwen3-8B-Q4_K_M.gguf.verified.json"
  RMDir "${folder}"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro deleteTrackerModels "$LOCALAPPDATA\PM Application Tracker\Models"
    !insertmacro deleteTrackerModels "$APPDATA\pm-application-tracker\Models"
    !insertmacro deleteTrackerModels "$APPDATA\PM Application Tracker\Models"
  ${endif}
!macroend
