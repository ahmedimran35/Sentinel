import fs from 'node:fs/promises';
import path from 'node:path';

export interface JetBrainsPluginConfig {
  name?: string;
  version?: string;
  serverPort?: number;
  sentinelPath?: string;
}

export async function generateJetBrainsPlugin(
  outputDir: string,
  config?: JetBrainsPluginConfig,
): Promise<void> {
  const cfg: Required<JetBrainsPluginConfig> = {
    name: config?.name ?? 'sentinel-jetbrains',
    version: config?.version ?? '0.1.0',
    serverPort: config?.serverPort ?? 4096,
    sentinelPath: config?.sentinelPath ?? 'sentinel',
  };

  const pkg = cfg.name.replace(/-/g, '.');
  const srcBase = path.join(outputDir, 'src', 'main');
  const kotlinDir = path.join(srcBase, 'kotlin', ...pkg.split('.'));
  const resourcesDir = path.join(srcBase, 'resources', 'META-INF');

  await fs.mkdir(kotlinDir, { recursive: true });
  await fs.mkdir(resourcesDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(outputDir, 'build.gradle.kts'), generateBuildGradle(cfg, pkg)),
    writeFile(path.join(resourcesDir, 'plugin.xml'), generatePluginXml(cfg, pkg)),
    writeFile(path.join(kotlinDir, 'SentinelToolWindowFactory.kt'), generateToolWindowFactory(cfg, pkg)),
    writeFile(path.join(kotlinDir, 'SentinelAction.kt'), generateAction(cfg, pkg)),
    writeFile(path.join(kotlinDir, 'SentinelClient.kt'), generateClient(cfg, pkg)),
    writeFile(path.join(kotlinDir, 'SentinelPanel.kt'), generatePanel(cfg, pkg)),
  ]);
}

function generateBuildGradle(cfg: Required<JetBrainsPluginConfig>, pkg: string): string {
  return `plugins {
  id("org.jetbrains.kotlin.jvm") version "1.9.0"
  id("org.jetbrains.intellij") version "1.17.0"
}

group = "${pkg}"
version = "${cfg.version}"

repositories { mavenCentral() }

intellij {
  pluginName.set("${cfg.name}")
  version.set("2023.3")
  type.set("IC")
  downloadSources.set(true)
}

dependencies {
  implementation("org.jetbrains.kotlin:kotlin-stdlib")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
}

tasks {
  buildSearchableOptions { enabled = false }
  patchPluginXml {
    sinceBuild.set("233")
    untilBuild.set("243.*")
  }
}
`;
}

function generatePluginXml(cfg: Required<JetBrainsPluginConfig>, pkg: string): string {
  return `<idea-plugin>
  <id>${pkg}</id>
  <name>${cfg.name}</name>
  <version>${cfg.version}</version>
  <vendor>Sentinel</vendor>
  <description>AI coding agent integration for JetBrains IDEs</description>
  <depends>com.intellij.modules.platform</depends>

  <actions>
    <action id="Sentinel.RunAction" class="${pkg}.SentinelAction"
            text="Sentinel: Run" description="Run Sentinel">
      <keyboard-shortcut keymap="$default" first-keystroke="control shift S" second-keystroke=""/>
      <add-to-group group-id="ToolsMenu" anchor="last"/>
    </action>
  </actions>

  <extensions defaultExtensionNs="com.intellij">
    <toolWindow id="Sentinel" anchor="right"
                factoryClass="${pkg}.SentinelToolWindowFactory"
                iconClass="AllIcons.General.Information"/>
  </extensions>
</idea-plugin>
`;
}

function generateToolWindowFactory(_cfg: Required<JetBrainsPluginConfig>, pkg: string): string {
  return `package ${pkg}

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class SentinelToolWindowFactory : ToolWindowFactory {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = SentinelPanel(project)
    val content = ContentFactory.getInstance().createContent(panel, "", false)
    toolWindow.contentManager.addContent(content)
  }
}
`;
}

function generateAction(_cfg: Required<JetBrainsPluginConfig>, pkg: string): string {
  return `package ${pkg}

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.ui.Messages

class SentinelAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val editor = e.getData(CommonDataKeys.EDITOR) ?: return
    val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
    val selection = editor.selectionModel.selectedText ?: ""
    val prompt = Messages.showInputDialog(project, "What should Sentinel do?", "Sentinel", null)
    if (prompt != null) {
      val client = SentinelClient(project)
      client.sendState(file.path, selection, prompt)
    }
  }
}
`;
}

function generateClient(cfg: Required<JetBrainsPluginConfig>, pkg: string): string {
  return `package ${pkg}

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SentinelClient(private val project: Project) {
  private val logger = Logger.getInstance(SentinelClient::class.java)
  private val client = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .build()
  private val baseUrl = "http://localhost:${cfg.serverPort}"

  fun sendState(filePath: String, selection: String, prompt: String) {
    val json = JSONObject()
    json.put("method", "editor/getState")
    json.put("params", JSONObject().apply {
      put("file", filePath)
      put("selection", selection)
      put("prompt", prompt)
    })
    val body = RequestBody.create(MediaType.parse("application/json"), json.toString())
    val request = Request.Builder().url("$baseUrl/api/editor/state").post(body).build()
    client.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: java.io.IOException) {
        logger.error("Sentinel connection failed", e)
      }
      override fun onResponse(call: Call, response: Response) {
        logger.info("Sentinel response: " + response.body()?.string())
        response.close()
      }
    })
  }
}
`;
}

function generatePanel(_cfg: Required<JetBrainsPluginConfig>, pkg: string): string {
  return `package ${pkg}

import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import java.awt.BorderLayout
import javax.swing.*

class SentinelPanel(private val project: Project) : JPanel(BorderLayout()) {
  private val messagesArea = JTextArea(20, 40).apply {
    isEditable = false
    lineWrap = true
    wrapStyleWord = true
  }
  private val inputField = JBTextField()

  init {
    add(JBScrollPane(messagesArea), BorderLayout.CENTER)
    val bottomPanel = JPanel(BorderLayout())
    bottomPanel.add(inputField, BorderLayout.CENTER)
    val sendButton = JButton("Send").apply {
      addActionListener { sendMessage() }
    }
    bottomPanel.add(sendButton, BorderLayout.EAST)
    add(bottomPanel, BorderLayout.SOUTH)

    inputField.addActionListener { sendMessage() }
  }

  private fun sendMessage() {
    val text = inputField.text.trim()
    if (text.isEmpty()) return
    messagesArea.append("You: $text\\n")
    inputField.text = ""
    val client = SentinelClient(project)
    client.sendState("", "", text)
    messagesArea.append("Sentinel: processing...\\n")
  }
}
`;
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}
