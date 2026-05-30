const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const outputPath = path.join(__dirname, "test_screenshot.png");

// PowerShell commands to capture screen
const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save("${outputPath.replace(/\\/g, "\\\\")}", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;

console.log("Running screen capture test...");
exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, " ").replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
  if (err) {
    console.error("Screen capture failed:", err);
    console.error("Stderr:", stderr);
    process.exit(1);
  }
  
  if (fs.existsSync(outputPath)) {
    console.log("Success! Screenshot saved to:", outputPath);
    // Delete file after success test
    fs.unlinkSync(outputPath);
  } else {
    console.error("File was not created. Output:", stdout);
  }
});
