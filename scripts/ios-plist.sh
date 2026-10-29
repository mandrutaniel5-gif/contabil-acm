#!/bin/bash
# Setările iOS ale aplicației (după „cap add ios”): permisiuni, limba română (datele, tastatura, butoanele sistemului).
P=ios/App/App/Info.plist
B=/usr/libexec/PlistBuddy
$B -c "Add :NSCameraUsageDescription string 'Camera este folosită pentru fotografierea bonurilor și facturilor.'" $P 2>/dev/null || $B -c "Set :NSCameraUsageDescription 'Camera este folosită pentru fotografierea bonurilor și facturilor.'" $P
$B -c "Add :NSPhotoLibraryUsageDescription string 'Accesul la poze permite atașarea documentelor justificative.'" $P 2>/dev/null || $B -c "Set :NSPhotoLibraryUsageDescription 'Accesul la poze permite atașarea documentelor justificative.'" $P
$B -c "Set :CFBundleDevelopmentRegion ro" $P 2>/dev/null || $B -c "Add :CFBundleDevelopmentRegion string ro" $P
$B -c "Delete :CFBundleLocalizations" $P 2>/dev/null; $B -c "Add :CFBundleLocalizations array" $P; $B -c "Add :CFBundleLocalizations:0 string ro" $P
$B -c "Add :ITSAppUsesNonExemptEncryption bool false" $P 2>/dev/null || true
echo "Info.plist actualizat"
