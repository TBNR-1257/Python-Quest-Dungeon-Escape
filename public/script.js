// script.js
async function testDatabase() {
  const statusDiv = document.getElementById("status");
  statusDiv.className = "status loading";
  statusDiv.innerHTML = "🔄 Testing database connection...";

  try {
    const response = await fetch("/api/test-db");
    const data = await response.json();

    if (data.success) {
      statusDiv.className = "status success";
      statusDiv.innerHTML =
        "✅ Database connection successful!<br>Ready to build your game!";
    } else {
      statusDiv.className = "status error";
      statusDiv.innerHTML = `❌ Database connection failed!<br>${data.message}`;
    }
  } catch (error) {
    statusDiv.className = "status error";
    statusDiv.innerHTML = `❌ Server connection failed!<br>Make sure the server is running.`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const testButton = document.getElementById("test-db-btn");
  const refreshButton = document.getElementById("refresh-btn");

  testButton.addEventListener("click", testDatabase);
  refreshButton.addEventListener("click", () => location.reload());

  // Optionally test on page load
  testDatabase();
});
