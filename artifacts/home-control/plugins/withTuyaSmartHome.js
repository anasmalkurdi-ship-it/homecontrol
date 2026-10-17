const fs = require('node:fs');
const path = require('node:path');
const {
  createRunOncePlugin,
  withDangerousMod,
  withInfoPlist,
  withPodfile,
} = require('@expo/config-plugins');

const TUYA_SPEC_SOURCE = "source 'https://github.com/tuya/tuya-pod-specs.git'";
const COCOAPODS_SPEC_SOURCE = "source 'https://github.com/CocoaPods/Specs.git'";

function withTuyaSmartHome(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSLocalNetworkUsageDescription =
      'Home Control uses your local network to pair and control Tuya devices.';

    if (process.env.TUYA_SDK_APP_KEY) {
      mod.modResults.TuyaAppKey = process.env.TUYA_SDK_APP_KEY;
    }
    if (process.env.TUYA_SDK_APP_SECRET) {
      mod.modResults.TuyaAppSecret = process.env.TUYA_SDK_APP_SECRET;
    }
    return mod;
  });

  config = withPodfile(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes(COCOAPODS_SPEC_SOURCE)) {
      contents = `${COCOAPODS_SPEC_SOURCE}\n${contents}`;
    }
    if (!contents.includes(TUYA_SPEC_SOURCE)) {
      contents = `${TUYA_SPEC_SOURCE}\n${contents}`;
    }

    const targetMatch = contents.match(/target\s+['"][^'"]+['"]\s+do/);
    if (!targetMatch || targetMatch.index === undefined) {
      throw new Error('Could not find the iOS app target in the generated Podfile.');
    }

    const insertAt = targetMatch.index + targetMatch[0].length;
    const pods = [
      !contents.includes('use_modular_headers!') && '  use_modular_headers!',
      !contents.includes("pod 'ThingSmartHomeKit'") &&
        "  pod 'ThingSmartHomeKit', '~> 7.8.0'",
      !contents.includes("pod 'ThingSmartBusinessExtensionKit'") &&
        "  pod 'ThingSmartBusinessExtensionKit', '~> 7.8.0'",
      !contents.includes("pod 'ThingSmartCryption'") &&
        "  pod 'ThingSmartCryption', :path => './ios_core_sdk'",
    ]
      .filter(Boolean)
      .join('\n');
    if (!pods) {
      mod.modResults.contents = contents;
      return mod;
    }
    contents = `${contents.slice(0, insertAt)}\n${pods}\n${contents.slice(insertAt)}`;
    mod.modResults.contents = contents;
    return mod;
  });

  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const sourcePath = path.join(
        mod.modRequest.projectRoot,
        'private',
        'ios_core_sdk',
      );
      const destinationPath = path.join(
        mod.modRequest.platformProjectRoot,
        'ios_core_sdk',
      );

      if (!fs.existsSync(path.join(sourcePath, 'ThingSmartCryption.podspec'))) {
        throw new Error(
          'The private Tuya iOS SDK bundle is missing. Restore private/ios_core_sdk before generating iOS.',
        );
      }

      fs.cpSync(sourcePath, destinationPath, { recursive: true });
      return mod;
    },
  ]);

  return config;
}

module.exports = createRunOncePlugin(
  withTuyaSmartHome,
  'with-tuya-smart-home',
  '1.0.0',
);
