import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controller/user_project_controller.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class UserProjectScreen extends StatefulWidget {

  final String userId;

  const UserProjectScreen({
    super.key,
    required this.userId,
  });

  @override
  State<UserProjectScreen> createState() => _UserProjectScreenState();
}

class _UserProjectScreenState extends State<UserProjectScreen> {

  final controller = Get.put(UserProjectController());

  @override
  void initState() {
    super.initState();
    controller.loadUserProjects(widget.userId);
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(

      appBar: AppBar(
        title: Text(AppLocalizations.of(context).translate("Projets utilisateur")),
      ),

      body: Obx((){

        if(controller.loading.value){
          return const Center(child:CircularProgressIndicator());
        }

        return Column(

          children:[

            Padding(

              padding:const EdgeInsets.all(20),

              child: Text(

                "${AppLocalizations.of(context).translate('Nombre de projets')} : ${controller.total.value}",

                style:const TextStyle(
                  fontSize:20,
                  fontWeight:FontWeight.bold
                ),

              ),

            ),

            Expanded(

              child: ListView.builder(

                itemCount:controller.projects.length,

                itemBuilder:(context,index){

                  final project = controller.projects[index];

                  return Card(

                    margin:const EdgeInsets.symmetric(
                      horizontal:20,
                      vertical:8
                    ),

                    child:ListTile(

                      leading:const Icon(Icons.business),

                      title:Text(project["nomProjet"] ?? ""),

                      subtitle:Text(

                        "${AppLocalizations.of(context).translate('Entreprise')} : ${project["entreprise"] ?? ""}\n"
                        "${AppLocalizations.of(context).translate('Pipeline')} : ${project["pipelineStage"] ?? ""}"

                      ),

                    )

                  );

                }

              )

            )

          ]

        );

      })

    );

  }

}