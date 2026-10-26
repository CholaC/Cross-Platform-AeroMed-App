// Copyright 2013 The Flutter Authors BSD-style license

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter_android/google_maps_flutter_android.dart';
import 'package:google_maps_flutter_platform_interface/google_maps_flutter_platform_interface.dart';

import 'advanced_marker_icons.dart';
import 'advanced_markers_clustering.dart';
import 'animate_camera.dart';
import 'clustering.dart';
import 'collision_behavior.dart';
import 'ground_overlay.dart';
import 'heatmap.dart';
import 'lite_mode.dart';
import 'map_click.dart';
import 'map_coordinates.dart';
import 'map_map_id.dart';
import 'map_ui.dart';
import 'marker_icons.dart';
import 'move_camera.dart';
import 'padding.dart';
import 'page.dart';
import 'place_advanced_marker.dart';
import 'place_circle.dart';
import 'place_marker.dart';
import 'place_polygon.dart';
import 'place_polyline.dart';
import 'scrolling_map.dart';
import 'snapshot.dart';
import 'tile_overlay.dart';

// Map ID for when using advanced markers.
const String? _mapId = null;

final List<GoogleMapAppPage> _allPages = <GoogleMapAppPage>[
  const MapUiPage(),
  const MapCoordinatesPage(),
  const MapClickPage(),
  const AnimateCameraPage(),
  const MoveCameraPage(),
  const PlaceMarkerPage(),
  const PlaceAdvancedMarkerPage(mapId: _mapId),
  const MarkerIconsPage(),
  const AdvancedMarkerIconsPage(mapId: _mapId),
  const ScrollingMapPage(),
  const PlacePolylinePage(),
  const PlacePolygonPage(),
  const PlaceCirclePage(),
  const PaddingPage(),
  const SnapshotPage(),
  const LiteModePage(),
  const TileOverlayPage(),
  const GroundOverlayPage(),
  const ClusteringPage(),
  const AdvancedMarkersClustering(mapId: _mapId),
  const MapIdPage(),
  const HeatmapPage(),
  const AdvancedMarkerCollisionBehaviorPage(mapId: _mapId),
];

/// MapsApp Main Application.
class MapsApp extends StatelessWidget {
  /// Default Constructor
  const MapsApp({super.key});

  void _pushPage(BuildContext context, GoogleMapAppPage page) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: Text(page.title)),
          body: page,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('GoogleMaps Locations')),
      body: ListView.builder(
        itemCount: _allPages.length,
        itemBuilder: (_, int index) => ListTile(
          leading: _allPages[index].leading,
          title: Text(_allPages[index].title),
          onTap: () => _pushPage(context, _allPages[index]),
        ),
      ),
    );
  }
}

void main() {
  final GoogleMapsFlutterPlatform mapsImplementation = GoogleMapsFlutterPlatform.instance;
  if (mapsImplementation is GoogleMapsFlutterAndroid) {
    initializeMapRenderer();
  }
  runApp(const MaterialApp(home: MapsApp()));
}

Completer<AndroidMapRenderer?>? _initializedRendererCompleter;

/// Initialize map renderer to the `latest` renderer type for Android platform.
///
/// The renderer must be requested before creating GoogleMap instances,
/// as the renderer can be initialized only once per application context.
Future<AndroidMapRenderer?> initializeMapRenderer() async {
  if (_initializedRendererCompleter != null) {
    return _initializedRendererCompleter!.future;
  }

  final completer = Completer<AndroidMapRenderer?>();
  _initializedRendererCompleter = completer;

  WidgetsFlutterBinding.ensureInitialized();

  final GoogleMapsFlutterPlatform mapsImplementation = GoogleMapsFlutterPlatform.instance;
  if (mapsImplementation is GoogleMapsFlutterAndroid) {
    unawaited(
      mapsImplementation
          .initializeWithRenderer(AndroidMapRenderer.latest)
          .then(
            (AndroidMapRenderer initializedRenderer) => completer.complete(initializedRenderer),
          ),
    );
  } else {
    completer.complete();
  }

  return completer.future;
}
