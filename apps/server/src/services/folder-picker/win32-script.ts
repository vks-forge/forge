/**
 * The PowerShell program that shows the Explorer folder window on Windows.
 *
 * Why: the old tree-style folder dialog is what .NET gives for free, but it is not the window
 *   people know. Explorer's own picker (`IFileOpenDialog` with the pick-folders option) has the
 *   address bar, search and Quick access, so it is compiled from a few lines of C# at run time
 *   (`Add-Type`; no package, no binary shipped). A window opened by a background process tends
 *   to appear behind the browser, so the picker gets a hidden always-on-top owner window and
 *   Windows keeps it in front. If the C# fails to compile or the COM call fails, the classic
 *   dialog runs instead, so a person still gets a window. The start folder travels in an
 *   environment variable, never inside the script text.
 *
 * Exports: WIN32_PICKER_SCRIPT, WIN32_START_ENV, PICKER_TITLE.
 * Depends on: nothing. No IO.
 */

/** Title shown on the window (also used by the other platforms). */
export const PICKER_TITLE = 'Choose the repository folder';

/** Environment variable that carries the folder to open in. */
export const WIN32_START_ENV = 'FORGE_PICK_START';

const CSHARP = `
using System;
using System.Runtime.InteropServices;

public static class ForgeFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  class FileOpenDialogRcw {}

  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
    void AddPlace(IShellItem item, int alignment);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
    void Close([MarshalAs(UnmanagedType.Error)] int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr filter);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr bc, ref Guid handler, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem item);
    void GetDisplayName(uint kind, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem other, uint hint, out int order);
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr bc, ref Guid riid, out IShellItem item);

  const int ERROR_CANCELLED = unchecked((int)0x800704C7);

  public static string Pick(IntPtr owner, string title, string start) {
    IFileDialog dialog = (IFileDialog)new FileOpenDialogRcw();
    uint options;
    dialog.GetOptions(out options);
    dialog.SetOptions(options | 0x20 | 0x40 | 0x800);
    dialog.SetTitle(title);

    if (!String.IsNullOrEmpty(start)) {
      try {
        Guid iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
        IShellItem folder;
        SHCreateItemFromParsingName(start, IntPtr.Zero, ref iid, out folder);
        dialog.SetFolder(folder);
      } catch (Exception) {}
    }

    int hr = dialog.Show(owner);
    if (hr == ERROR_CANCELLED) { return ""; }
    if (hr != 0) { throw new InvalidOperationException("folder window failed: " + hr); }

    IShellItem result;
    dialog.GetResult(out result);
    string path;
    result.GetDisplayName(0x80058000, out path);
    return path;
  }
}
`;

/** Prints the chosen folder to stdout as UTF-8; prints nothing when the window is cancelled. */
export const WIN32_PICKER_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$title = '${PICKER_TITLE}'
$start = $env:${WIN32_START_ENV}
$cs = @'
${CSHARP}
'@
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = 'None'
$owner.StartPosition = 'Manual'
$owner.Location = New-Object System.Drawing.Point(-32000, -32000)
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show()
$owner.Activate()
$picked = ''
try {
  try {
    Add-Type -TypeDefinition $cs
    $picked = [ForgeFolderPicker]::Pick($owner.Handle, $title, $start)
  } catch {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $title
    $dialog.UseDescriptionForTitle = $true
    if ($start) { $dialog.SelectedPath = $start }
    if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $picked = $dialog.SelectedPath }
  }
  [Console]::Out.Write($picked)
} finally {
  $owner.Close()
  $owner.Dispose()
}
`;
