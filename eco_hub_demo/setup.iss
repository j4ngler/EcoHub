; Inno Setup Script for EcoHub QR Scanner
; Download Inno Setup: https://jrsoftware.org/isdl.php

#define MyAppName "EcoHub QR Scanner"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "EcoHub Team"
#define MyAppURL "https://ecohub.vn"
#define MyAppExeName "EcoHub_QR_Scanner.exe"

[Setup]
; Basic info
AppId={{A1B2C3D4-E5F6-4A5B-8C7D-9E0F1A2B3C4D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer_output
OutputBaseFilename=EcoHub_QR_Scanner_Setup_v{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern

; Windows version
MinVersion=6.1

; Icon (nếu có)
; SetupIconFile=icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Main application files
Source: "dist\EcoHub_QR_Scanner\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Config file (nếu chưa có)
Source: "config.json"; DestDir: "{app}"; Flags: onlyifdoesntexist

; README
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    // Create videos folder
    if not DirExists(ExpandConstant('{app}\videos')) then
      CreateDir(ExpandConstant('{app}\videos'));
  end;
end;
