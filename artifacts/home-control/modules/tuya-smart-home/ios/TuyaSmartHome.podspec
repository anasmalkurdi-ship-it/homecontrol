Pod::Spec.new do |s|
  s.name = 'TuyaSmartHome'
  s.version = '1.0.0'
  s.summary = 'Expo native bridge for Tuya SmartLife device pairing and control'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Home Control'
  s.homepage = 'https://github.com/expo/expo'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ThingSmartHomeKit', '~> 7.11.0'
  s.dependency 'ThingSmartSceneCoreKit', '5.25.0'
  s.dependency 'ThingSmartBusinessExtensionKit', '~> 7.11.0'

  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
