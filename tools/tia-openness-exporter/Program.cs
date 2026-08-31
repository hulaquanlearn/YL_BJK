using Siemens.Engineering;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.SW;
using Siemens.Engineering.SW.Blocks;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security;
using System.Text;
using System.Web.Script.Serialization;

namespace Zhitong.PlcExporter
{
    internal sealed class ExportItem
    {
        public string itemType { get; set; }
        public string name { get; set; }
        public string blockType { get; set; }
        public string language { get; set; }
        public string address { get; set; }
        public string contentText { get; set; }
        public string sourcePath { get; set; }
        public string sourceRef { get; set; }
        public bool isProtected { get; set; }
        public Dictionary<string, object> metadata { get; set; }
    }

    internal sealed class ExportPackage
    {
        public string format { get; set; } = "zhitong-plcai/1";
        public string generatedAt { get; set; }
        public string projectName { get; set; }
        public string tiaVersion { get; set; }
        public string sourceProject { get; set; }
        public Dictionary<string, object> projectMetadata { get; set; } = new Dictionary<string, object>
        {
            { "platform", "siemens_tia" },
            { "devices", new List<Dictionary<string, object>>() },
            { "networks", new List<Dictionary<string, object>>() }
        };
        public string securityNote { get; set; } = "No password is stored in this package.";
        public List<ExportItem> items { get; set; } = new List<ExportItem>();
        public List<string> warnings { get; set; } = new List<string>();
    }

    internal static class Program
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private static bool AllowInteractiveUnlock = true;

        [STAThread]
        private static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            AllowInteractiveUnlock = !args.Any(arg => string.Equals(arg, "--non-interactive", StringComparison.OrdinalIgnoreCase));
            if (args.Length < 2)
            {
                Console.WriteLine("用法：Zhitong.PlcExporter.exe <.ap16/.ap17项目入口> <输出目录>");
                return 2;
            }

            var projectFile = new FileInfo(Path.GetFullPath(args[0]));
            var outputDir = Directory.CreateDirectory(Path.GetFullPath(args[1]));
            if (!projectFile.Exists) { Console.Error.WriteLine("项目入口不存在：" + projectFile.FullName); return 2; }
            var version = projectFile.Extension.Equals(".ap16", StringComparison.OrdinalIgnoreCase) ? "V16" :
                          projectFile.Extension.Equals(".ap17", StringComparison.OrdinalIgnoreCase) ? "V17" : "unknown";
            if (version == "unknown") { Console.Error.WriteLine("请传入解包后的 .ap16 或 .ap17 项目入口。加密 .zap 包请先用对应版本 TIA Portal解包。 "); return 2; }

            var package = new ExportPackage
            {
                generatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                projectName = Path.GetFileNameWithoutExtension(projectFile.Name),
                tiaVersion = version,
                sourceProject = projectFile.Name
            };

            try
            {
                using (var tia = new TiaPortal(TiaPortalMode.WithoutUserInterface))
                {
                    var project = tia.Projects.Open(projectFile);
                    foreach (var device in project.Devices)
                        ExportDevice(device, outputDir, package);
                    package.projectMetadata["deviceCount"] = MetadataList(package, "devices").Count;
                    package.projectMetadata["networkCount"] = MetadataList(package, "networks").Count;
                    project.Close(); // 明确不调用 Save()
                }
                var packagePath = Path.Combine(outputDir.FullName, SafeName(package.projectName) + "-" + version + ".plcai");
                File.WriteAllText(packagePath, Json.Serialize(package), new UTF8Encoding(false));
                Console.WriteLine("导出完成：" + packagePath);
                Console.WriteLine("条目数量：" + package.items.Count);
                if (package.warnings.Count > 0)
                {
                    Console.WriteLine("警告数量：" + package.warnings.Count);
                    Console.WriteLine("该解析包不完整。请在 TIA Portal 中重新编译软件并消除不一致项后再次导出。");
                }
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("导出失败：" + ex.Message);
                return 1;
            }
        }

        private static void ExportDevice(Device device, DirectoryInfo outputDir, ExportPackage package)
        {
            var devices = MetadataList(package, "devices");
            if (devices.Count < 2000)
            {
                devices.Add(new Dictionary<string, object>
                {
                    { "kind", "device" },
                    { "name", device.Name },
                    { "typeIdentifier", ReadDeviceAttribute(device, "TypeIdentifier") },
                    { "orderNumber", ReadDeviceAttribute(device, "OrderNumber") },
                    { "firmwareVersion", ReadDeviceAttribute(device, "FirmwareVersion") }
                });
            }
            foreach (var item in device.DeviceItems)
                VisitDeviceItem(item, outputDir, package);
        }

        private static void VisitDeviceItem(DeviceItem item, DirectoryInfo outputDir, ExportPackage package)
        {
            var typeIdentifier = ReadDeviceItemAttribute(item, "TypeIdentifier");
            var ipAddress = ReadDeviceItemAttribute(item, "IPAddress");
            var subnetMask = ReadDeviceItemAttribute(item, "SubnetMask");
            var devices = MetadataList(package, "devices");
            if (devices.Count < 2000)
            {
                devices.Add(new Dictionary<string, object>
                {
                    { "kind", "device_item" },
                    { "name", item.Name },
                    { "typeIdentifier", typeIdentifier },
                    { "orderNumber", ReadDeviceItemAttribute(item, "OrderNumber") },
                    { "firmwareVersion", ReadDeviceItemAttribute(item, "FirmwareVersion") }
                });
            }
            if (!string.IsNullOrWhiteSpace(ipAddress))
            {
                var networks = MetadataList(package, "networks");
                if (networks.Count < 2000)
                {
                    networks.Add(new Dictionary<string, object>
                    {
                        { "device", item.Name },
                        { "ipAddress", ipAddress },
                        { "subnetMask", subnetMask },
                        { "routerAddress", ReadDeviceItemAttribute(item, "RouterAddress") }
                    });
                }
            }
            var container = item.GetService<SoftwareContainer>();
            var plc = container?.Software as PlcSoftware;
            if (plc != null)
            {
                if (!package.projectMetadata.ContainsKey("cpuModel") || string.IsNullOrWhiteSpace(Convert.ToString(package.projectMetadata["cpuModel"])))
                    package.projectMetadata["cpuModel"] = !string.IsNullOrWhiteSpace(typeIdentifier) ? typeIdentifier : item.Name;
                ExportBlockGroup(plc.BlockGroup, outputDir, package);
            }
            foreach (var child in item.DeviceItems)
                VisitDeviceItem(child, outputDir, package);
        }

        private static List<Dictionary<string, object>> MetadataList(ExportPackage package, string key)
        {
            return (List<Dictionary<string, object>>)package.projectMetadata[key];
        }

        private static string ReadDeviceAttribute(Device device, string name)
        {
            try { return Convert.ToString(device.GetAttribute(name)); } catch { return ""; }
        }

        private static string ReadDeviceItemAttribute(DeviceItem item, string name)
        {
            try { return Convert.ToString(item.GetAttribute(name)); } catch { return ""; }
        }

        private static void ExportBlockGroup(PlcBlockGroup group, DirectoryInfo outputDir, ExportPackage package)
        {
            foreach (var block in group.Blocks)
                ExportBlock(block, outputDir, package);
            foreach (var child in group.Groups)
                ExportBlockGroup(child, outputDir, package);
        }

        private static void ExportBlock(PlcBlock block, DirectoryInfo outputDir, ExportPackage package)
        {
            bool protectedFlag = ReadProtectionFlag(block);
            bool unlocked = false;
            if (protectedFlag && AllowInteractiveUnlock)
            {
                Console.WriteLine($"检测到受保护块 {block.Name}，是否输入密码并导出完整代码？[y/N]");
                if (string.Equals(Console.ReadLine()?.Trim(), "y", StringComparison.OrdinalIgnoreCase))
                {
                    using (var password = ReadPassword())
                    {
                        try
                        {
                            var provider = block.GetService<PlcBlockProtectionProvider>();
                            if (provider == null) Console.WriteLine("当前块未提供解锁服务，将只导出公开接口。");
                            else { provider.Unprotect(password); unlocked = true; Console.WriteLine("授权成功，正在导出完整代码。"); }
                        }
                        catch (Exception ex) { Console.WriteLine("授权失败，将只导出公开接口：" + ex.Message); }
                    }
                }
            }

            var file = new FileInfo(Path.Combine(outputDir.FullName, SafeName(block.Name) + ".xml"));
            try
            {
                block.Export(file, ExportOptions.WithDefaults);
                var content = File.ReadAllText(file.FullName, Encoding.UTF8);
                package.items.Add(new ExportItem
                {
                    itemType = "block", name = block.Name, blockType = block.GetType().Name,
                    language = ReadAttribute(block, "ProgrammingLanguage"), address = "",
                    contentText = content, sourcePath = file.Name, sourceRef = block.Name,
                    isProtected = protectedFlag && !unlocked,
                    metadata = new Dictionary<string, object> { { "authorizedLocalUnlock", unlocked }, { "passwordStored", false } }
                });
            }
            catch (Exception ex)
            {
                if (file.Exists)
                {
                    try { file.Delete(); } catch { }
                }
                var warning = "未导出块 " + block.Name + "（" + block.GetType().Name + "）：" + ex.Message;
                package.warnings.Add(warning);
                Console.WriteLine("警告：" + warning);
            }
        }

        private static bool ReadProtectionFlag(PlcBlock block)
        {
            foreach (var name in new[] { "IsKnowHowProtected", "KnowHowProtection" })
            {
                try { if (Convert.ToBoolean(block.GetAttribute(name))) return true; } catch { }
            }
            return false;
        }

        private static string ReadAttribute(PlcBlock block, string name)
        {
            try { return Convert.ToString(block.GetAttribute(name)); } catch { return "XML"; }
        }

        private static SecureString ReadPassword()
        {
            Console.Write("密码（不回显）：");
            var secure = new SecureString();
            while (true)
            {
                var key = Console.ReadKey(true);
                if (key.Key == ConsoleKey.Enter) break;
                if (key.Key == ConsoleKey.Backspace) { if (secure.Length > 0) secure.RemoveAt(secure.Length - 1); continue; }
                if (!char.IsControl(key.KeyChar)) secure.AppendChar(key.KeyChar);
            }
            Console.WriteLine();
            secure.MakeReadOnly();
            return secure;
        }

        private static string SafeName(string value)
        {
            var invalid = Path.GetInvalidFileNameChars();
            return string.Concat((value ?? "block").Select(ch => invalid.Contains(ch) ? '_' : ch));
        }
    }
}
