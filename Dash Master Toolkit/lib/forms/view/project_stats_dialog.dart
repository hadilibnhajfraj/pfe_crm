import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../providers/api_client.dart';

class ProjectStatsDialog extends StatefulWidget {
  final String projectId;

  const ProjectStatsDialog({super.key, required this.projectId});

  @override
  State<ProjectStatsDialog> createState() => _ProjectStatsDialogState();
}

class _ProjectStatsDialogState extends State<ProjectStatsDialog> {

  List actions = [];
  bool loading = true;

  /// 🔥 PROGRESSION PAR STAGE (FIX ERREUR)
  final Map<String, double> stageProgress = {
    "Visite": 10,
    "Plan technique": 30,
    "Echantillonnage": 50,
    "Devis envoyé": 70,
    "Negociation": 85,
    "Commande gagnée": 100,
    "Commande perdue": 0,
  };

  /// 🔥 COULEURS PAR STAGE
  Color getColor(String stage) {
    switch(stage){
      case "Visite": return Colors.blue;
      case "Plan technique": return Colors.orange;
      case "Echantillonnage": return Colors.deepOrange;
      case "Devis envoyé": return Colors.purple;
      case "Negociation": return Colors.red;
      case "Commande gagnée": return Colors.green;
      case "Commande perdue": return Colors.grey;
      default: return Colors.blueGrey;
    }
  }

  @override
  void initState() {
    super.initState();
    loadActions();
  }

  Future<void> loadActions() async {
    try {
      final res = await ApiClient.instance.dio
          .get("/projects/${widget.projectId}/actions");

      setState(() {
        actions = res.data;
        loading = false;
      });

    } catch (e) {
      print("❌ LOAD ACTIONS ERROR: $e");
    }
  }

  /// 🔥 DATA GRAPH PROGRESSION
  List<BarChartGroupData> buildChartData() {

    final List<String> orderedStages = [];

    for (var a in actions) {
      final type = a["typeAction"];
      if (type != null && !orderedStages.contains(type)) {
        orderedStages.add(type);
      }
    }

    int i = 0;

    return orderedStages.map((stage) {

      final progress = stageProgress[stage] ?? 0;

      return BarChartGroupData(
        x: i++,
        barRods: [
          BarChartRodData(
            toY: progress,
            width: 22,
            borderRadius: BorderRadius.circular(6),
            color: getColor(stage),
          )
        ],
      );

    }).toList();
  }

  /// 🔥 LISTE STAGES UNIQUE (IMPORTANT POUR AXE X)
List<String> getStages() {
  return actions
      .map((a) => (a["typeAction"] ?? "").toString())
      .toSet()
      .toList();
}

  @override
  Widget build(BuildContext context) {

    final stages = getStages();

    return Dialog(
      child: Container(
        width: 650,
        padding: const EdgeInsets.all(20),

        child: loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [

                  /// TITLE
                  const Text(
                    "Project Progress",
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 20),

                  /// 🔥 GRAPH
                  SizedBox(
                    height: 300,
                    child: BarChart(
                      BarChartData(
                        maxY: 100, // ✅ important pour %
                        borderData: FlBorderData(show: false),

                        titlesData: FlTitlesData(

                          /// Y AXIS %
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              interval: 20,
                              getTitlesWidget: (value, meta) {
                                return Text("${value.toInt()}%");
                              },
                            ),
                          ),

                          /// X AXIS STAGES
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              getTitlesWidget: (value, meta) {

                                if (value.toInt() >= stages.length) {
                                  return const SizedBox();
                                }

                                return Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text(
                                    stages[value.toInt()],
                                    style: const TextStyle(fontSize: 10),
                                  ),
                                );
                              },
                            ),
                          ),

                          rightTitles: AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),

                          topTitles: AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                        ),

                        gridData: FlGridData(show: true),
                        barGroups: buildChartData(),
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),

                  /// 🔥 LIST ACTIONS (timeline simplifiée)
                  SizedBox(
                    height: 220,
                    child: ListView.builder(
                      itemCount: actions.length,
                      itemBuilder: (_, i) {

                        final a = actions[i];

                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(10),

                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(10),
                          ),

                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [

                              /// DOT
                              Container(
                                width: 10,
                                height: 10,
                                margin: const EdgeInsets.only(top: 6),
                                decoration: BoxDecoration(
                                  color: getColor(a["typeAction"]),
                                  shape: BoxShape.circle,
                                ),
                              ),

                              const SizedBox(width: 10),

                              /// CONTENT
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      a["typeAction"] ?? "",
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text("Date: ${a["dateAction"]}"),

                                    if (a["reminders"] != null &&
                                        a["reminders"].isNotEmpty)
                                      Text(
                                        "Relance: ${a["reminders"][0]["dateRelance"]}",
                                        style: const TextStyle(color: Colors.orange),
                                      ),
                                  ],
                                ),
                              )
                            ],
                          ),
                        );
                      },
                    ),
                  )
                ],
              ),
      ),
    );
  }
}