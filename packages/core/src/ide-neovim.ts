import fs from 'node:fs/promises';
import path from 'node:path';

export interface NeovimPluginConfig {
  sentinelPath?: string;
  serverPort?: number;
}

export async function generateNeovimPlugin(
  outputDir: string,
  config?: NeovimPluginConfig,
): Promise<void> {
  const cfg: Required<NeovimPluginConfig> = {
    sentinelPath: config?.sentinelPath ?? 'sentinel',
    serverPort: config?.serverPort ?? 4096,
  };

  const luaDir = path.join(outputDir, 'lua', 'sentinel');
  const pluginDir = path.join(outputDir, 'plugin');

  await fs.mkdir(luaDir, { recursive: true });
  await fs.mkdir(pluginDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(luaDir, 'init.lua'), generateInit(cfg)),
    writeFile(path.join(luaDir, 'client.lua'), generateClient(cfg)),
    writeFile(path.join(luaDir, 'config.lua'), generateConfig(cfg)),
    writeFile(path.join(luaDir, 'commands.lua'), generateCommands(cfg)),
    writeFile(path.join(pluginDir, 'sentinel.vim'), generateVimDetect(cfg)),
  ]);
}

function generateInit(_cfg: Required<NeovimPluginConfig>): string {
  return `local M = {}

M.config = require("sentinel.config")
M.client = require("sentinel.client")
M.commands = require("sentinel.commands")

function M.setup(opts)
  M.config.setup(opts)
  M.commands.setup()
end

return M
`;
}

function generateClient(_cfg: Required<NeovimPluginConfig>): string {
  return `local M = {}

local config = require("sentinel.config")
local pending = {}
local msg_id = 0

function M.request(method, params, callback)
  msg_id = msg_id + 1
  local id = tostring(msg_id)
  local msg = vim.fn.json_encode({
    type = "request",
    id = id,
    method = method,
    params = params or vim.empty_dict()
  })
  pending[id] = callback
  M._send(msg)
end

function M.notify(method, params)
  local msg = vim.fn.json_encode({
    type = "notification",
    method = method,
    params = params or vim.empty_dict()
  })
  M._send(msg)
end

M._send = function(msg)
  if config.options.use_curl then
    vim.fn.jobstart({
      "curl", "-s", "-X", "POST",
      "-H", "Content-Type: application/json",
      "-d", msg,
      string.format("http://localhost:%d/api/rpc", config.options.port)
    }, { detach = true })
  else
    vim.fn.jobstart({
      config.options.sentinel_path, "rpc", "--port", tostring(config.options.port)
    }, {
      detach = true,
      on_stdout = function(_, data)
        if data then
          for _, line in ipairs(data) do
            if line and #line > 0 then
              local ok, decoded = pcall(vim.fn.json_decode, line)
              if ok and decoded and decoded.id then
                local cb = pending[decoded.id]
                if cb then
                  cb(decoded)
                  pending[decoded.id] = nil
                end
              end
            end
          end
        end
      end
    })
  end
end

function M.get_state(callback)
  local buf = vim.api.nvim_get_current_buf()
  local file = vim.api.nvim_buf_get_name(buf)
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  local content = table.concat(lines, "\\n")
  local mode = vim.fn.mode()
  local start_line, start_col = unpack(vim.api.nvim_win_get_cursor(0))
  M.request("editor/getState", {
    file = file,
    content = content,
    cursor = { line = start_line, col = start_col },
    mode = mode,
  }, callback)
end

return M
`;
}

function generateConfig(cfg: Required<NeovimPluginConfig>): string {
  return `local M = {}

M.options = {
  port = ${cfg.serverPort},
  sentinel_path = "${cfg.sentinelPath}",
  use_curl = true,
  keymaps = {
    run = "<leader>sr",
    toggle = "<leader>st",
    explain = "<leader>se",
  },
}

function M.setup(opts)
  if opts then
    for k, v in pairs(opts) do
      if type(v) == "table" and type(M.options[k]) == "table" then
        for k2, v2 in pairs(v) do
          M.options[k][k2] = v2
        end
      else
        M.options[k] = v
      end
    end
  end
end

return M
`;
}

function generateCommands(_cfg: Required<NeovimPluginConfig>): string {
  return `local M = {}

local config = require("sentinel.config")
local client = require("sentinel.client")

function M.setup()
  vim.api.nvim_create_user_command("SentinelRun", function(opts)
    local prompt = opts.args
    if #prompt == 0 then
      prompt = vim.fn.input("Sentinel: ")
    end
    if #prompt == 0 then return end
    client.get_state(function(res)
      vim.notify("Sentinel: " .. prompt, vim.log.levels.INFO)
    end)
  end, { nargs = "*", desc = "Run Sentinel with a prompt" })

  vim.api.nvim_create_user_command("SentinelToggle", function()
    -- Toggle sentinel output buffer
    local buf = vim.fn.bufnr("sentinel://output")
    if vim.api.nvim_buf_is_valid(buf) then
      vim.api.nvim_buf_delete(buf, { force = true })
    else
      vim.cmd("new sentinel://output")
      vim.bo.buftype = "nofile"
      vim.bo.bufhidden = "wipe"
    end
  end, { desc = "Toggle Sentinel output buffer" })

  vim.api.nvim_create_user_command("SentinelExplain", function()
    local selection = vim.fn.getregion(vim.fn.getpos("'<"), vim.fn.getpos("'>"), { type = vim.fn.visualmode() })
    local text = table.concat(selection, "\\n")
    if #text == 0 then
      vim.notify("Select text first", vim.log.levels.WARN)
      return
    end
    client.request("editor/getSelection", { text = text }, function(res)
      vim.notify("Sentinel explanation requested for " .. #text .. " chars", vim.log.levels.INFO)
    end)
  end, { range = true, desc = "Explain selected code" })

  vim.keymap.set("n", config.options.keymaps.run, function()
    vim.cmd("SentinelRun ")
  end, { desc = "Sentinel: Run" })

  vim.keymap.set("n", config.options.keymaps.toggle, function()
    vim.cmd("SentinelToggle")
  end, { desc = "Sentinel: Toggle" })

  vim.keymap.set("v", config.options.keymaps.explain, function()
    vim.cmd("SentinelExplain")
  end, { desc = "Sentinel: Explain" })
end

return M
`;
}

function generateVimDetect(_cfg: Required<NeovimPluginConfig>): string {
  return `" sentinel.vim — Plugin detection
if exists('g:loaded_sentinel')
  finish
endif
let g:loaded_sentinel = 1

lua << EOF
require("sentinel").setup()
EOF
`;
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}
